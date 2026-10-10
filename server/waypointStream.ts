import { encode as encodeJpeg } from 'jpeg-js'
import type { WebSocket } from 'ws'
import {
  applyControls,
  generateFacilityRgba,
  type ViewState,
} from './frameGenerator.ts'

const WIDTH = 480
const HEIGHT = 270
const TEMPORAL = 4
/** Batches/sec → TEMPORAL * BATCH_HZ JPEG FPS (18×4 = 72, matching Codex's ~72 gen FPS). */
const BATCH_HZ = 18

function buildEnvelope(jpegs: Buffer[], header: Record<string, unknown>): Buffer {
  const hdr = Buffer.from(JSON.stringify(header))
  const parts: Buffer[] = []
  const hlen = Buffer.alloc(4)
  hlen.writeUInt32LE(hdr.length, 0)
  parts.push(hlen, hdr)
  const n = Buffer.alloc(4)
  n.writeUInt32LE(jpegs.length, 0)
  parts.push(n)
  for (const j of jpegs) {
    const jl = Buffer.alloc(4)
    jl.writeUInt32LE(j.length, 0)
    parts.push(jl, j)
  }
  return Buffer.concat(parts)
}

export interface WaypointSession {
  id: string
  view: ViewState
  keys: string[]
  mouseDx: number
  mouseDy: number
  scroll: number
  clientTs: number
  frameId: number
  paused: boolean
  socket: WebSocket | null
  timer: ReturnType<typeof setInterval> | null
  mock: boolean
}

const sessions = new Map<string, WaypointSession>()
let engineBusy = false

export function isEngineBusy(): boolean {
  return engineBusy
}

export function attachWaypointStream(socket: WebSocket, seed: string | null): void {
  if (engineBusy) {
    socket.send(
      JSON.stringify({
        type: 'error',
        msg: 'engine busy (another stream or clip is running)',
      }),
    )
    socket.close()
    return
  }
  engineBusy = true

  const id = `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const session: WaypointSession = {
    id,
    view: { yaw: 0, pitch: 0, x: 0, z: 0 },
    keys: [],
    mouseDx: 0,
    mouseDy: 0,
    scroll: 0,
    clientTs: 0,
    frameId: 0,
    paused: false,
    socket,
    timer: null,
    mock: true,
  }
  sessions.set(id, session)

  socket.send(
    JSON.stringify({
      type: 'hello',
      session_id: id,
      engine: 'MockWaypointEngine',
      width: WIDTH,
      height: HEIGHT,
      temporal_compression: TEMPORAL,
      seed: seed ?? 'facility_default',
      mock: true,
    }),
  )

  const keySetFromButtons = (buttons: string[]): string[] => {
    const map: Record<string, string> = {
      W: 'w',
      A: 'a',
      S: 's',
      D: 'd',
      UP: 'w',
      DOWN: 's',
      LEFT: 'a',
      RIGHT: 'd',
    }
    return buttons.map((b) => map[b] ?? '').filter(Boolean)
  }

  socket.on('message', (data, isBinary) => {
    if (isBinary) return
    try {
      const msg = JSON.parse(data.toString()) as {
        type?: string
        buttons?: string[]
        dx?: number
        dy?: number
        scroll?: number
        ts?: number
      }
      if (msg.type === 'control') {
        session.keys = keySetFromButtons(msg.buttons ?? [])
        session.mouseDx += Number(msg.dx ?? 0)
        session.mouseDy += Number(msg.dy ?? 0)
        session.scroll = Number(msg.scroll ?? 0)
        session.clientTs = Number(msg.ts ?? 0)
      } else if (msg.type === 'pause') {
        session.paused = true
        socket.send(JSON.stringify({ type: 'status', status: 'paused', mock: true }))
      } else if (msg.type === 'resume') {
        session.paused = false
        socket.send(JSON.stringify({ type: 'status', status: 'streaming', mock: true }))
      }
    } catch {
      // ignore
    }
  })

  const interval = Math.round(1000 / BATCH_HZ)
  session.timer = setInterval(() => {
    if (!session.socket || session.socket.readyState !== 1) return
    if (session.paused) return
    pushBatch(session)
  }, interval)

  const cleanup = () => {
    if (session.timer) clearInterval(session.timer)
    sessions.delete(id)
    engineBusy = false
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
}

function pushBatch(session: WaypointSession): void {
  const t0 = Date.now()
  const mousePxX = session.mouseDx * 40
  const mousePxY = session.mouseDy * 40
  session.view = applyControls(session.view, session.keys, mousePxX, mousePxY)
  session.mouseDx = 0
  session.mouseDy = 0

  // One render per batch; duplicate JPEG to honor temporal_compression without blowing CPU.
  const rgba = generateFacilityRgba(WIDTH, HEIGHT, session.view, session.frameId)
  const encoded = Buffer.from(encodeJpeg({ data: rgba, width: WIDTH, height: HEIGHT }, 60).data)
  const jpegs = Array.from({ length: TEMPORAL }, () => encoded)

  const genMs = Date.now() - t0
  const header = {
    frame_id: session.frameId,
    gen_ms: genMs,
    temporal_compression: TEMPORAL,
    client_ts: session.clientTs || null,
  }
  session.frameId += TEMPORAL

  try {
    session.socket!.send(buildEnvelope(jpegs, header))
  } catch {
    // drop
  }
}
