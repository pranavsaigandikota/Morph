import { encode as encodeJpeg } from 'jpeg-js'
import type { WebSocket } from 'ws'
import type { WorldControlMessage, WorldSceneId } from '../src/types/world.ts'
import {
  applyControls,
  generateFacilityRgba,
  type ViewState,
} from './frameGenerator.ts'

/** Product-native mock frames (docs/PRODUCT_NATIVE_720P.md). No 360p demo mode. */
const WIDTH = 1280
const HEIGHT = 720
/** Slightly lower FPS in cloud mock — 720p JPEG encode is heavier than 360p. */
const TARGET_FPS = 12

export interface WorldSession {
  id: string
  sceneId: WorldSceneId
  prompt: string
  status: 'starting' | 'ready' | 'streaming' | 'paused' | 'stopped'
  createdAt: number
  view: ViewState
  frameId: number
  sequence: number
  epoch: number
  dropped: number
  lastControl: WorldControlMessage | null
  keys: string[]
  mouseDx: number
  mouseDy: number
  lastClientTs: number | null
  socket: WebSocket | null
  timer: ReturnType<typeof setInterval> | null
  generatedFps: number
  displayedHint: number
  lastFrameAt: number
  inferenceMs: number
  /** Last generated JPEG — discarded on reset (stale frames). */
  lastJpeg: Buffer | null
}

/** Snapshot used by MOCK checkpoint save (native 1280×720 JPEG). */
export interface SessionFrameSnapshot {
  jpeg: Buffer
  frameId: number
  seq: number
  epoch: number
  width: number
  height: number
}

const sessions = new Map<string, WorldSession>()

export function createSession(sceneId: WorldSceneId, prompt: string): WorldSession {
  const id = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const session: WorldSession = {
    id,
    sceneId,
    prompt,
    status: 'starting',
    createdAt: Date.now(),
    view: { yaw: 0, pitch: 0, x: 0, z: 0 },
    frameId: 0,
    sequence: 0,
    epoch: 1,
    dropped: 0,
    lastControl: null,
    keys: [],
    mouseDx: 0,
    mouseDy: 0,
    lastClientTs: null,
    socket: null,
    timer: null,
    generatedFps: TARGET_FPS,
    displayedHint: TARGET_FPS,
    lastFrameAt: Date.now(),
    inferenceMs: 40,
    lastJpeg: null,
  }
  sessions.set(id, session)
  setTimeout(() => {
    if (session.status === 'starting') session.status = 'ready'
  }, 400)
  return session
}

export function getSession(id: string): WorldSession | undefined {
  return sessions.get(id)
}

export function listSessionMetrics(id: string) {
  const s = sessions.get(id)
  if (!s) return null
  const latency = Math.max(16, Date.now() - s.lastFrameAt + s.inferenceMs)
  return {
    session_id: s.id,
    generated_fps: s.generatedFps,
    displayed_fps: s.displayedHint,
    latency_ms: latency,
    dropped_frames: s.dropped,
    gpu_memory_mb: 512 + Math.round((s.frameId % 40) * 1.5),
    connection_status:
      s.socket && s.socket.readyState === 1
        ? ('connected' as const)
        : s.status === 'starting'
          ? ('connecting' as const)
          : ('disconnected' as const),
    mock: true,
  }
}

/**
 * Restore original seed pose. Advances epoch, clears held controls,
 * discards stale lastJpeg so clients reject old-epoch frames.
 */
export function resetSession(id: string): { ok: true; epoch: number } | { ok: false } {
  const s = sessions.get(id)
  if (!s) return { ok: false }
  s.view = { yaw: 0, pitch: 0, x: 0, z: 0 }
  s.frameId = 0
  s.sequence = 0
  s.epoch += 1
  s.dropped = 0
  s.keys = []
  s.mouseDx = 0
  s.mouseDy = 0
  s.lastControl = null
  s.lastJpeg = null
  s.lastClientTs = null
  s.status = s.socket ? 'streaming' : 'ready'
  if (s.socket && s.socket.readyState === 1) {
    try {
      s.socket.send(
        JSON.stringify({
          type: 'status',
          status: s.status,
          epoch: s.epoch,
          mock: true,
          message: 'reset — seed restored (MOCK); stale frames discarded',
        }),
      )
    } catch {
      /* */
    }
  }
  return { ok: true, epoch: s.epoch }
}

/**
 * Render (or reuse) a genuine mock engine JPEG for checkpoint Capture View.
 * Does not screenshot a browser canvas.
 */
export function renderSessionJpeg(sessionId: string): SessionFrameSnapshot | null {
  const s = sessions.get(sessionId)
  if (!s) return null
  s.view = applyControls(s.view, s.keys, s.mouseDx, s.mouseDy)
  s.mouseDx = 0
  s.mouseDy = 0
  const rgba = generateFacilityRgba(WIDTH, HEIGHT, s.view, s.frameId)
  const jpeg = Buffer.from(
    encodeJpeg({ data: rgba, width: WIDTH, height: HEIGHT }, 70).data,
  )
  s.frameId += 1
  s.sequence += 1
  s.lastFrameAt = Date.now()
  s.lastJpeg = jpeg
  return {
    jpeg,
    frameId: s.frameId,
    seq: s.sequence,
    epoch: s.epoch,
    width: WIDTH,
    height: HEIGHT,
  }
}

export function stopSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  detachSocket(s)
  s.status = 'stopped'
  sessions.delete(id)
  return true
}

export function pauseSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  s.status = 'paused'
  if (s.socket?.readyState === 1) {
    s.socket.send(JSON.stringify({ type: 'status', status: 'paused', mock: true }))
  }
  return true
}

export function resumeSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  s.status = 'streaming'
  if (s.socket?.readyState === 1) {
    s.socket.send(JSON.stringify({ type: 'status', status: 'streaming', mock: true }))
  }
  return true
}

function detachSocket(s: WorldSession): void {
  if (s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
  s.socket = null
}

/**
 * Codex-aligned mock stream (docs/codex/FRONTEND_INTEGRATION.md):
 * hello → repeating (text type:"frame" + one JPEG binary).
 * Not the Phase-2 batch envelope (that is /stream only).
 */
export function attachSocket(sessionId: string, socket: WebSocket): WorldSession | null {
  const s = sessions.get(sessionId)
  if (!s) return null
  if (s.socket) detachSocket(s)
  s.socket = socket
  s.status = 'streaming'

  socket.send(
    JSON.stringify({
      type: 'hello',
      controller: true,
      session_id: s.id,
      engine: 'MockWaypointEngine',
      width: WIDTH,
      height: HEIGHT,
      temporal_compression: 4,
      epoch: s.epoch,
      encoding: 'jpeg',
      max_unacknowledged_frames: 8,
      mock: true,
      clock: 'server perf_counter milliseconds; client timestamp echoed unchanged',
    }),
  )

  const intervalMs = Math.round(1000 / TARGET_FPS)
  s.timer = setInterval(() => {
    if (!s.socket || s.socket.readyState !== 1) return
    if (s.status === 'paused') return
    pushFrame(s)
  }, intervalMs)

  socket.on('message', (data, isBinary) => {
    if (isBinary) return
    try {
      const msg = JSON.parse(data.toString()) as WorldControlMessage & {
        type: string
        timestamp_ms?: number
        frame_id?: number
        epoch?: number
      }
      if (msg.type === 'control') {
        s.lastControl = msg
        s.keys = (msg.keys ?? []).map((k) => String(k).toLowerCase())
        s.mouseDx = msg.mouse_dx ?? 0
        s.mouseDy = msg.mouse_dy ?? 0
        s.lastClientTs = msg.timestamp_ms ?? null
        s.view = applyControls(s.view, s.keys, s.mouseDx, s.mouseDy)
        s.mouseDx = 0
        s.mouseDy = 0
        socket.send(
          JSON.stringify({
            type: 'control_ack',
            seq: msg.seq,
            timestamp_ms: msg.timestamp_ms ?? null,
            mock: true,
          }),
        )
      } else if (msg.type === 'display_ack') {
        // Credit accounting — accept and ignore in MOCK.
      } else if (msg.type === 'pause') {
        s.status = 'paused'
        socket.send(JSON.stringify({ type: 'status', status: 'paused', mock: true }))
      } else if (msg.type === 'resume') {
        s.status = 'streaming'
        socket.send(JSON.stringify({ type: 'status', status: 'streaming', mock: true }))
      }
    } catch {
      // ignore malformed
    }
  })

  socket.on('close', () => {
    detachSocket(s)
    if (s.status !== 'stopped') s.status = 'ready'
  })

  return s
}

function pushFrame(s: WorldSession): void {
  const t0 = Date.now()
  if (Math.random() < 0.02) {
    s.dropped += 1
    return
  }

  s.view = applyControls(s.view, s.keys, 0, 0)
  const rgba = generateFacilityRgba(WIDTH, HEIGHT, s.view, s.frameId)
  const jpeg = Buffer.from(encodeJpeg({ data: rgba, width: WIDTH, height: HEIGHT }, 70).data)
  s.inferenceMs = 28 + Math.round(Math.random() * 35)
  s.frameId += 1
  s.sequence += 1
  s.lastFrameAt = Date.now()
  s.generatedFps = TARGET_FPS
  s.lastJpeg = jpeg

  const batchSize = 4
  const batchIndex = (s.frameId - 1) % batchSize
  const meta = {
    type: 'frame',
    session_id: s.id,
    frame_id: s.frameId,
    batch_id: Math.floor((s.frameId - 1) / batchSize),
    batch_index: batchIndex,
    batch_size: batchSize,
    epoch: s.epoch,
    generated_at_ms: s.lastFrameAt,
    inference_ms: s.inferenceMs,
    width: WIDTH,
    height: HEIGHT,
    encoding: 'jpeg',
    seq: s.sequence,
    client_timestamp_ms: s.lastClientTs,
    server_input_to_generated_ms: s.inferenceMs + 10,
    sent_at_ms: Date.now(),
    mock: true,
  }

  try {
    s.socket!.send(JSON.stringify(meta))
    s.socket!.send(jpeg)
  } catch {
    s.dropped += 1
  }

  s.displayedHint = Math.max(1, TARGET_FPS - (Date.now() - t0 > 50 ? 1 : 0))
}
