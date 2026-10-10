import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { evaluateAgent, getAgentReplay, listAgentReplays } from './agentsStore.ts'
import { createSimulation, getReplay, getSimulation, stepSimulation } from './simulationStore.ts'
import {
  attachSocket,
  createSession,
  getSession,
  listSessionMetrics,
  pauseSession,
  resetSession,
  resumeSession,
  stopSession,
} from './worldSessions.ts'
import { attachWaypointStream, isEngineBusy } from './waypointStream.ts'
import {
  attachMockMemoryV11,
  discardMockMemory,
  mockHealthCapabilities,
  noteMockReset,
} from './mockMemoryV11.ts'

const PORT = Number(process.env.MOCK_API_PORT ?? 4822)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

/** Waypoint Phase-2 health surface (Codex / Biome-compatible). */
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/readyz', (_req, res) => {
  res.json({ ready: true, mode: 'mock', engine: 'MockWaypointEngine' })
})

app.get('/status', (_req, res) => {
  res.json({
    mode: 'mock',
    engine: 'MockWaypointEngine',
    model: 'mock-facility',
    quant: null,
    temporal_compression: 4,
    busy: isEngineBusy(),
    mock: true,
  })
})

app.get('/actions', (_req, res) => {
  res.json({
    buttons: ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT'],
    mouse: { dx: '[-1,1]', dy: '[-1,1]' },
    scroll: [-1, 0, 1],
  })
})

app.get('/seeds', (_req, res) => {
  res.json({ seeds: ['facility_default'] })
})

/**
 * Waypoint-compatible /health for frontend probe().
 * Must expose model_loaded + status so MOCK Explorer can start;
 * mock:true must stay explicit so LIVE is never implied.
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ready',
    model_loaded: true,
    model: 'MockWaypointEngine',
    quant: null,
    prompt_conditioning: false,
    mock: true,
    services: { world: 'ok', simulation: 'ok', agents: 'ok' },
    ...mockHealthCapabilities(),
  })
})

/** Legacy WorldShift contract (kept for older clients). */
app.post('/world/start', (req, res) => {
  const body = req.body as { scene_id?: string; prompt?: string }
  const session = createSession(
    (body.scene_id as 'facility') ?? 'facility',
    body.prompt ?? 'First-person industrial research facility',
  )
  res.status(202).json({ session_id: session.id, status: 'starting' })
})

app.post('/world/reset', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  const result = sessionId ? resetSession(sessionId) : { ok: false as const }
  if (!result.ok) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  noteMockReset(sessionId)
  res.json({
    session_id: sessionId,
    status: 'ready',
    epoch: result.epoch,
    mock: true,
    seed_restored: true,
  })
})

attachMockMemoryV11(app)

app.post('/world/stop', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  if (!sessionId || !stopSession(sessionId)) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  discardMockMemory(sessionId)
  res.json({ session_id: sessionId, status: 'stopped' })
})

app.post('/world/pause', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  if (!sessionId || !pauseSession(sessionId)) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  res.json({ session_id: sessionId, status: 'paused' })
})

app.post('/world/resume', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  if (!sessionId || !resumeSession(sessionId)) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  res.json({ session_id: sessionId, status: 'streaming' })
})

app.get('/world/metrics', (req, res) => {
  const sessionId = String(req.query.session_id ?? '')
  const metrics = listSessionMetrics(sessionId)
  if (!metrics) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  res.json(metrics)
})

app.post('/simulations', (req, res) => {
  const state = createSimulation(req.body ?? {})
  res.status(201).json({ id: state.id, status: 'created', map_id: state.map_id })
})

app.post('/simulations/:id/step', (req, res) => {
  const result = stepSimulation(req.params.id)
  if (!result) {
    res.status(404).json({ error: 'simulation_not_found' })
    return
  }
  res.json({ id: result.state.id, step: result.state.step, state: result.state, done: result.done })
})

app.get('/simulations/:id', (req, res) => {
  const state = getSimulation(req.params.id)
  if (!state) {
    res.status(404).json({ error: 'simulation_not_found' })
    return
  }
  res.json(state)
})

app.get('/simulations/:id/replay', (req, res) => {
  const replay = getReplay(req.params.id)
  if (!replay) {
    res.status(404).json({ error: 'simulation_not_found' })
    return
  }
  res.json(replay)
})

app.post('/agents/evaluate', (req, res) => {
  const { agent_id, scenario_id, episodes } = req.body ?? {}
  if (!agent_id || !scenario_id) {
    res.status(400).json({ error: 'agent_id and scenario_id required' })
    return
  }
  const result = evaluateAgent({ agent_id, scenario_id, episodes })
  res.status(201).json(result)
})

app.get('/agents/replays', (_req, res) => {
  res.json(listAgentReplays())
})

app.get('/agents/replays/:id', (req, res) => {
  const replay = getAgentReplay(req.params.id)
  if (!replay) {
    res.status(404).json({ error: 'replay_not_found' })
    return
  }
  res.json(replay)
})

const server = createServer(app)

/** Codex / Waypoint Phase-2 live stream. */
const wssWaypoint = new WebSocketServer({ noServer: true })
/** Legacy WorldShift stream. */
const wssLegacy = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', `http://127.0.0.1:${PORT}`)
  if (url.pathname === '/stream') {
    wssWaypoint.handleUpgrade(req, socket, head, (ws) => {
      wssWaypoint.emit('connection', ws, req)
    })
    return
  }
  if (url.pathname === '/world/stream') {
    wssLegacy.handleUpgrade(req, socket, head, (ws) => {
      wssLegacy.emit('connection', ws, req)
    })
    return
  }
  socket.destroy()
})

wssWaypoint.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '', `http://127.0.0.1:${PORT}`)
  const seed = url.searchParams.get('seed')
  attachWaypointStream(socket, seed)
})

wssLegacy.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '', `http://127.0.0.1:${PORT}`)
  const sessionId = url.searchParams.get('session_id')
  if (!sessionId || !getSession(sessionId)) {
    socket.send(JSON.stringify({ type: 'status', status: 'error', message: 'invalid session' }))
    socket.close()
    return
  }
  attachSocket(sessionId, socket)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[worldshift-mock] http://127.0.0.1:${PORT}`)
  console.log(`[worldshift-mock] Waypoint WS  ws://127.0.0.1:${PORT}/stream?seed=…`)
  console.log(`[worldshift-mock] Legacy  WS  ws://127.0.0.1:${PORT}/world/stream?session_id=…`)
})
