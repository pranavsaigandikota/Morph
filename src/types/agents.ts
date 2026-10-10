export interface EvaluationRequest {
  agent_id: string
  scenario_id: string
  episodes?: number
}

export interface EpisodeResult {
  episode: number
  reward: number
  steps: number
  success: boolean
  latency_ms: number
  victims_rescued: number
}

export interface EvaluationResult {
  evaluation_id: string
  agent_id: string
  scenario_id: string
  created_at: string
  episodes: EpisodeResult[]
  metrics: {
    success_rate: number
    mean_reward: number
    mean_steps: number
    mean_latency_ms: number
    mean_victims_rescued: number
  }
  training_curve: Array<{ step: number; reward: number; success_rate: number }>
}

export interface AgentReplaySummary {
  id: string
  agent_id: string
  scenario_id: string
  success: boolean
  steps: number
  reward: number
  created_at: string
}
