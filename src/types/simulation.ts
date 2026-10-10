export type HazardType = 'fire' | 'smoke' | 'chemical' | 'collapse'
export type CellType = 'floor' | 'wall' | 'blocked' | 'door' | 'exit' | 'hazard' | 'spawn'

export interface MapCell {
  x: number
  y: number
  type: CellType
  hazard?: HazardType
}

export interface BuildingMap {
  id: string
  name: string
  width: number
  height: number
  cells: MapCell[]
  walls: Array<{ x1: number; y1: number; x2: number; y2: number }>
  exits: Array<{ x: number; y: number; label: string }>
  hazards: Array<{ x: number; y: number; type: HazardType; intensity: number }>
  spawn: { x: number; y: number }
}

export interface AgentPose {
  x: number
  y: number
  heading: number
  status: 'idle' | 'navigating' | 'rescuing' | 'evacuating' | 'failed' | 'success'
}

export interface SimulationState {
  id: string
  map_id: string
  step: number
  max_steps: number
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed'
  agent: AgentPose
  victims_remaining: number
  victims_rescued: number
  time_ms: number
  map: BuildingMap
}

export interface CreateSimulationRequest {
  map_id?: string
  seed?: number
}

export interface CreateSimulationResponse {
  id: string
  status: 'created'
  map_id: string
}

export interface SimulationStepResponse {
  id: string
  step: number
  state: SimulationState
  done: boolean
}

export interface ReplayFrame {
  step: number
  time_ms: number
  agent: AgentPose
  victims_remaining: number
  victims_rescued: number
}

export interface SimulationReplay {
  id: string
  map: BuildingMap
  frames: ReplayFrame[]
  summary: {
    success: boolean
    steps: number
    victims_rescued: number
    duration_ms: number
  }
}
