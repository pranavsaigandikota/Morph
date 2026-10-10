import type {
  CreateSimulationRequest,
  CreateSimulationResponse,
  SimulationReplay,
  SimulationState,
  SimulationStepResponse,
} from '../types/simulation'
import { apiFetch } from './api'

export const simulationApi = {
  create(req: CreateSimulationRequest = {}): Promise<CreateSimulationResponse> {
    return apiFetch('/simulations', { method: 'POST', body: JSON.stringify(req) })
  },

  get(id: string): Promise<SimulationState> {
    return apiFetch(`/simulations/${id}`)
  },

  step(id: string): Promise<SimulationStepResponse> {
    return apiFetch(`/simulations/${id}/step`, { method: 'POST', body: '{}' })
  },

  replay(id: string): Promise<SimulationReplay> {
    return apiFetch(`/simulations/${id}/replay`)
  },
}
