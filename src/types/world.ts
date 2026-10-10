export type WorldSceneId = 'facility' | 'warehouse' | 'lab_corridor'

export interface WorldScene {
  id: WorldSceneId
  title: string
  subtitle: string
  prompt: string
  atmosphere: string
  available: boolean
}

export interface WorldStartRequest {
  scene_id: WorldSceneId
  seed_image_path: string | null
  prompt: string
}

export interface WorldStartResponse {
  session_id: string
  status: 'starting' | 'ready' | 'error'
}

export interface WorldControlMessage {
  type: 'control'
  seq: number
  keys: string[]
  mouse_dx: number
  mouse_dy: number
  timestamp_ms: number
}

export interface WorldFrameMeta {
  type: 'frame_meta'
  frame_id: number
  sequence: number
  generated_at_ms: number
  inference_ms: number
  width: number
  height: number
  mime: string
  mock: boolean
  dropped_since_last: number
}

export interface WorldStatusMessage {
  type: 'status'
  status: 'connecting' | 'streaming' | 'paused' | 'error' | 'disconnected'
  message?: string
  mock?: boolean
}

export interface WorldMetrics {
  session_id: string
  generated_fps: number
  displayed_fps: number
  latency_ms: number
  dropped_frames: number
  gpu_memory_mb: number
  connection_status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error'
  mock: boolean
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  mock: boolean
  services: {
    world: string
    simulation: string
    agents: string
  }
}
