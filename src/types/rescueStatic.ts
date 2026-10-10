import type { BuildingMap, ReplayFrame } from './simulation'

export type RescuePackageMode = 'recorded_evaluation'

export interface RescueManifest {
  version: number
  title: string
  description?: string
  mode: RescuePackageMode
  handoff_note?: string
  default_map_id: string
  default_agent_id: string
  default_trajectory_id: string
  maps: Array<{ id: string; path: string; title: string }>
  agents: Array<{ id: string; path: string; name: string }>
  trajectories: Array<{
    id: string
    path: string
    agent_id: string
    map_id: string
    label: string
  }>
  evaluations: Array<{ id: string; path: string; title: string }>
  training_history: Array<{ id: string; path: string; agent_id: string; title: string }>
}

export interface RescueAgentInfo {
  id: string
  name: string
  kind: string
  description: string
  version: string
  checkpoint?: string
  created_at?: string
}

export interface StaticTrajectory {
  id: string
  agent_id: string
  map_id: string
  label: string
  recorded_at: string
  mode: RescuePackageMode
  frames: ReplayFrame[]
  summary: {
    success: boolean
    steps: number
    victims_rescued: number
    duration_ms: number
    reward?: number
  }
}

export interface StaticEvalAgentBlock {
  agent_id: string
  episodes: Array<{
    episode: number
    reward: number
    steps: number
    success: boolean
    latency_ms: number
    victims_rescued: number
  }>
  metrics: {
    success_rate: number
    mean_reward: number
    mean_steps: number
    mean_latency_ms: number
    mean_victims_rescued: number
  }
}

export interface StaticEvaluation {
  evaluation_id: string
  title: string
  mode: RescuePackageMode
  scenario_id: string
  created_at: string
  note?: string
  agents: StaticEvalAgentBlock[]
}

export interface StaticTrainingHistory {
  id: string
  agent_id: string
  title: string
  mode: RescuePackageMode
  note?: string
  created_at: string
  curve: Array<{ step: number; reward: number; success_rate: number; loss?: number }>
}

export interface RescueStaticBundle {
  manifest: RescueManifest
  maps: Record<string, BuildingMap>
  agents: Record<string, RescueAgentInfo>
  trajectories: Record<string, StaticTrajectory>
  evaluations: Record<string, StaticEvaluation>
  training: Record<string, StaticTrainingHistory>
}
