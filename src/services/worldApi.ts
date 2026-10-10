import type {
  HealthResponse,
  WorldMetrics,
  WorldStartRequest,
  WorldStartResponse,
} from '../types/world'
import { apiFetch } from './api'

export const worldApi = {
  health(): Promise<HealthResponse> {
    return apiFetch('/health')
  },

  start(req: WorldStartRequest): Promise<WorldStartResponse> {
    return apiFetch('/world/start', { method: 'POST', body: JSON.stringify(req) })
  },

  reset(sessionId: string): Promise<{ session_id: string; status: string }> {
    return apiFetch('/world/reset', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    })
  },

  stop(sessionId: string): Promise<{ session_id: string; status: string }> {
    return apiFetch('/world/stop', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    })
  },

  metrics(sessionId: string): Promise<WorldMetrics> {
    return apiFetch(`/world/metrics?session_id=${encodeURIComponent(sessionId)}`)
  },
}
