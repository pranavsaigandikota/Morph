import type {
  AgentPose,
  CreateSimulationRequest,
  ReplayFrame,
  SimulationReplay,
  SimulationState,
} from '../src/types/simulation.ts'
import { SAMPLE_MAP } from './sampleMap.ts'

interface SimRecord {
  state: SimulationState
  frames: ReplayFrame[]
  path: Array<{ x: number; y: number }>
}

const sims = new Map<string, SimRecord>()

function isBlocked(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= SAMPLE_MAP.width || y >= SAMPLE_MAP.height) return true
  return SAMPLE_MAP.cells.some((c) => c.x === x && c.y === y && c.type === 'wall')
}

function buildRescuePath(seed: number): Array<{ x: number; y: number }> {
  // Deterministic waypoint path visiting hazard-adjacent area then exits
  const path = [
    { x: 2, y: 9 },
    { x: 3, y: 9 },
    { x: 4, y: 9 },
    { x: 4, y: 10 },
    { x: 4, y: 12 },
    { x: 6, y: 12 },
    { x: 7, y: 12 },
    { x: 7, y: 10 },
    { x: 7, y: 7 },
    { x: 9, y: 7 },
    { x: 10, y: 7 },
    { x: 10, y: 9 },
    { x: 12, y: 9 },
    { x: 13, y: 9 },
    { x: 13, y: 11 },
    { x: 13, y: 13 },
    { x: 16, y: 13 },
    { x: 18, y: 13 },
    { x: 18, y: 15 },
    { x: 20, y: 15 },
    { x: 22, y: 15 },
  ]
  // Seed nudges alternate south exit vs north
  if (seed % 2 === 1) {
    path.splice(
      -4,
      4,
      { x: 18, y: 6 },
      { x: 20, y: 4 },
      { x: 21, y: 3 },
      { x: 22, y: 2 },
    )
  }
  return path.filter((p) => !isBlocked(p.x, p.y))
}

function headingBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

export function createSimulation(req: CreateSimulationRequest): SimulationState {
  const id = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const seed = req.seed ?? 42
  const path = buildRescuePath(seed)
  const agent: AgentPose = {
    x: SAMPLE_MAP.spawn.x,
    y: SAMPLE_MAP.spawn.y,
    heading: 0,
    status: 'idle',
  }
  const state: SimulationState = {
    id,
    map_id: SAMPLE_MAP.id,
    step: 0,
    max_steps: path.length + 5,
    status: 'created',
    agent,
    victims_remaining: 2,
    victims_rescued: 0,
    time_ms: 0,
    map: SAMPLE_MAP,
  }
  sims.set(id, {
    state,
    frames: [
      {
        step: 0,
        time_ms: 0,
        agent: { ...agent },
        victims_remaining: 2,
        victims_rescued: 0,
      },
    ],
    path,
  })
  return state
}

export function getSimulation(id: string): SimulationState | null {
  return sims.get(id)?.state ?? null
}

export function stepSimulation(id: string): { state: SimulationState; done: boolean } | null {
  const rec = sims.get(id)
  if (!rec) return null
  const { state, path, frames } = rec
  if (state.status === 'completed' || state.status === 'failed') {
    return { state, done: true }
  }

  state.status = 'running'
  state.step += 1
  state.time_ms = state.step * 250

  const idx = Math.min(state.step, path.length - 1)
  const pos = path[idx]!
  const prev = path[Math.max(0, idx - 1)]!
  state.agent = {
    x: pos.x,
    y: pos.y,
    heading: headingBetween(prev, pos),
    status: idx >= path.length - 1 ? 'evacuating' : idx > 8 ? 'rescuing' : 'navigating',
  }

  if (state.step === 10 && state.victims_rescued < 1) {
    state.victims_rescued = 1
    state.victims_remaining = 1
  }
  if (state.step === 16 && state.victims_rescued < 2) {
    state.victims_rescued = 2
    state.victims_remaining = 0
  }

  const atExit = SAMPLE_MAP.exits.some((e) => e.x === pos.x && e.y === pos.y)
  const done = atExit || state.step >= state.max_steps
  if (done) {
    state.status = atExit && state.victims_rescued > 0 ? 'completed' : 'failed'
    state.agent.status = state.status === 'completed' ? 'success' : 'failed'
  }

  frames.push({
    step: state.step,
    time_ms: state.time_ms,
    agent: { ...state.agent },
    victims_remaining: state.victims_remaining,
    victims_rescued: state.victims_rescued,
  })

  return { state, done }
}

export function getReplay(id: string): SimulationReplay | null {
  const rec = sims.get(id)
  if (!rec) return null
  // Auto-run remaining steps for a complete replay if needed
  while (rec.state.status !== 'completed' && rec.state.status !== 'failed') {
    stepSimulation(id)
  }
  return {
    id,
    map: SAMPLE_MAP,
    frames: rec.frames,
    summary: {
      success: rec.state.status === 'completed',
      steps: rec.state.step,
      victims_rescued: rec.state.victims_rescued,
      duration_ms: rec.state.time_ms,
    },
  }
}
