import type { WebSocket } from 'ws'
import type { WorldControlMessage, WorldFrameMeta, WorldSceneId } from '../src/types/world.ts'
import { applyControls, generateFacilityFrame, type ViewState } from './frameGenerator.ts'

const WIDTH = 640
const HEIGHT = 360
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
  dropped: number
  lastControl: WorldControlMessage | null
  keys: string[]
  mouseDx: number
  mouseDy: number
  socket: WebSocket | null
  timer: ReturnType<typeof setInterval> | null
  generatedFps: number
  displayedHint: number
  lastFrameAt: number
  inferenceMs: number
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
    dropped: 0,
    lastControl: null,
    keys: [],
    mouseDx: 0,
    mouseDy: 0,
    socket: null,
    timer: null,
    generatedFps: TARGET_FPS,
    displayedHint: TARGET_FPS,
    lastFrameAt: Date.now(),
    inferenceMs: 40,
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

export function resetSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  s.view = { yaw: 0, pitch: 0, x: 0, z: 0 }
  s.frameId = 0
  s.sequence = 0
  s.dropped = 0
  s.keys = []
  s.mouseDx = 0
  s.mouseDy = 0
  s.status = 'ready'
  return true
}

export function stopSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  detachSocket(s)
  s.status = 'stopped'
  sessions.delete(id)
  return true
}

function detachSocket(s: WorldSession): void {
  if (s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
  s.socket = null
}

export function attachSocket(sessionId: string, socket: WebSocket): WorldSession | null {
  const s = sessions.get(sessionId)
  if (!s) return null
  if (s.socket) detachSocket(s)
  s.socket = socket
  s.status = 'streaming'

  socket.send(
    JSON.stringify({
      type: 'status',
      status: 'streaming',
      message: 'Mock world stream connected',
      mock: true,
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
      const msg = JSON.parse(data.toString()) as WorldControlMessage & { type: string }
      if (msg.type === 'control') {
        s.lastControl = msg
        s.keys = msg.keys ?? []
        s.mouseDx = msg.mouse_dx ?? 0
        s.mouseDy = msg.mouse_dy ?? 0
        s.view = applyControls(s.view, s.keys, s.mouseDx, s.mouseDy)
        // Consume mouse delta each control packet
        s.mouseDx = 0
        s.mouseDy = 0
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

/**
 * Wire format (v1 mock transport):
 * 1) Text JSON frame_meta
 * 2) Binary PNG payload
 *
 * The client FrameTransport adapter isolates this so the engine team
 * can switch to a single framed binary blob without UI changes.
 */
function pushFrame(s: WorldSession): void {
  const t0 = Date.now()
  // Simulate occasional drop under load
  if (Math.random() < 0.03) {
    s.dropped += 1
    return
  }

  s.view = applyControls(s.view, s.keys, 0, 0)
  const png = generateFacilityFrame(WIDTH, HEIGHT, s.view, s.frameId)
  s.inferenceMs = 28 + Math.round(Math.random() * 35)
  s.frameId += 1
  s.sequence += 1
  s.lastFrameAt = Date.now()
  s.generatedFps = TARGET_FPS

  const meta: WorldFrameMeta = {
    type: 'frame_meta',
    frame_id: s.frameId,
    sequence: s.sequence,
    generated_at_ms: s.lastFrameAt,
    inference_ms: s.inferenceMs,
    width: WIDTH,
    height: HEIGHT,
    mime: 'image/png',
    mock: true,
    dropped_since_last: 0,
  }

  try {
    s.socket!.send(JSON.stringify(meta))
    s.socket!.send(png)
  } catch {
    s.dropped += 1
  }

  // Keep displayed hint near generated with slight jitter
  s.displayedHint = Math.max(1, TARGET_FPS - (Date.now() - t0 > 50 ? 1 : 0))
}
