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
  resetSession,
  stopSession,
} from './worldSessions.ts'
import type { WorldSceneId, WorldStartRequest } from '../src/types/world.ts'

const PORT = Number(process.env.MOCK_API_PORT ?? 4822)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mock: true,
    services: {
      world: 'ok',
      simulation: 'ok',
      agents: 'ok',
    },
  })
})

app.post('/world/start', (req, res) => {
  const body = req.body as WorldStartRequest
  const sceneId = (body.scene_id ?? 'facility') as WorldSceneId
  const prompt = body.prompt ?? 'First-person industrial research facility'
  const session = createSession(sceneId, prompt)
  res.status(202).json({ session_id: session.id, status: 'starting' })
})

app.post('/world/reset', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  if (!sessionId || !resetSession(sessionId)) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  res.json({ session_id: sessionId, status: 'ready' })
})

app.post('/world/stop', (req, res) => {
  const sessionId = String(req.body?.session_id ?? '')
  if (!sessionId || !stopSession(sessionId)) {
    res.status(404).json({ error: 'session_not_found' })
    return
  }
  res.json({ session_id: sessionId, status: 'stopped' })
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
const wss = new WebSocketServer({ server, path: '/world/stream' })

wss.on('connection', (socket, req) => {
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
  console.log(`[worldshift-mock] listening on http://127.0.0.1:${PORT}`)
  console.log(`[worldshift-mock] ws://127.0.0.1:${PORT}/world/stream?session_id=...`)
})
