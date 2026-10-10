import type { AgentReplaySummary, EvaluationRequest, EvaluationResult } from '../types/agents'
import { apiFetch } from './api'

export const agentsApi = {
  evaluate(req: EvaluationRequest): Promise<EvaluationResult> {
    return apiFetch('/agents/evaluate', { method: 'POST', body: JSON.stringify(req) })
  },

  listReplays(): Promise<AgentReplaySummary[]> {
    return apiFetch('/agents/replays')
  },

  getReplay(id: string): Promise<AgentReplaySummary> {
    return apiFetch(`/agents/replays/${id}`)
  },
}
