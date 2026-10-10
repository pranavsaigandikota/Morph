/**
 * Optional adapter for future live simulation / PPO inference.
 * Rescue Lab does NOT require this — static JSON under public/data/rescue/ is enough.
 *
 * Enable later with VITE_LIVE_SIM_URL (e.g. http://127.0.0.1:4822 or /api).
 */
import type {
  CreateSimulationRequest,
  CreateSimulationResponse,
  SimulationReplay,
  SimulationState,
  SimulationStepResponse,
} from '../types/simulation'
import type { EvaluationRequest, EvaluationResult } from '../types/agents'

const LIVE = import.meta.env.VITE_LIVE_SIM_URL as string | undefined

export function isLiveSimEnabled(): boolean {
  return Boolean(LIVE && LIVE.length > 0)
}

async function liveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!LIVE) throw new Error('Live sim adapter disabled (set VITE_LIVE_SIM_URL)')
  const base = LIVE.replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Live sim ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export const liveSimAdapter = {
  enabled: isLiveSimEnabled,

  create(req: CreateSimulationRequest = {}): Promise<CreateSimulationResponse> {
    return liveFetch('/simulations', { method: 'POST', body: JSON.stringify(req) })
  },

  get(id: string): Promise<SimulationState> {
    return liveFetch(`/simulations/${id}`)
  },

  step(id: string): Promise<SimulationStepResponse> {
    return liveFetch(`/simulations/${id}/step`, { method: 'POST', body: '{}' })
  },

  replay(id: string): Promise<SimulationReplay> {
    return liveFetch(`/simulations/${id}/replay`)
  },

  evaluate(req: EvaluationRequest): Promise<EvaluationResult> {
    return liveFetch('/agents/evaluate', { method: 'POST', body: JSON.stringify(req) })
  },
}
