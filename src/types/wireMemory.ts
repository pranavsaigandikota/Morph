/**
 * Wire types for World Memory API v1.1 (claude/live-memory-backend).
 * Snake_case matches backend JSON. Canonical:
 * docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md
 */

export interface WireCapabilities {
  memory_api: boolean
  checkpoint_restore: boolean
  calibration_capture: boolean
  light_navigation: boolean
  calibration_backend: boolean
  observations: boolean
  obstacles: boolean
  enhancement: boolean
}

export interface WireHealth {
  status: string
  model_loaded: boolean
  error?: string | null
  model: string
  quant?: string | null
  mock?: boolean
  prompt_conditioning?: boolean | null
  capabilities?: WireCapabilities
  contract?: string | null
}

export type SoftLabel =
  | 'forward'
  | 'forward_right'
  | 'right'
  | 'behind_right'
  | 'behind'
  | 'behind_left'
  | 'left'
  | 'forward_left'
  | 'unlabeled'

export interface WireNavigation {
  x: number
  z: number
  yaw: number
  pitch: number
  units: 'estimated_units'
  confidence: number
  cumulative_movement: number
  segment_id: string
  relationship: 'new_unknown' | 'estimated_continuous' | 'restored_view'
  control_seq: number
  epoch: number
  server_elapsed_ms: number
  /** v1.1 */
  anchor_kind?: 'world_start' | 'reset_to_seed' | 'checkpoint_restore'
  restored_from_checkpoint_id?: string | null
}

export interface WireCheckpointQuality {
  status: string
  reviewed: boolean
  approved: boolean
  indicators: Record<string, number>
}

export interface WireCalibrationMeta {
  calibration_id: string
  kind: 'capture' | 'return_check'
  soft_label: SoftLabel
}

export interface WireCheckpoint {
  checkpoint_id: string
  world_id: string
  session_id: string
  epoch: number
  prompt: string
  frame_id: number | null
  control_seq: number
  created_at: string
  provenance: 'initial_seed' | 'raw_video_frame'
  label: string
  navigation: WireNavigation
  quality: WireCheckpointQuality
  image_url: string
  enhanced_image_url: string | null
  enhancement_status: string
  image_sha256: string
  capture_reason?: 'initial_seed' | 'manual' | 'periodic' | 'calibration'
  calibration?: WireCalibrationMeta | null
  review?: {
    reviewed_at?: string | null
    reviewer?: string | null
    reason?: string | null
  } | null
}

export interface WireNavModel {
  version: number
  yaw_rad_per_unit: number
  units_per_second: number
  nominal_fps: number
  source: string
  turn_gain: string
  a0_report?: string
}

export interface WireMemorySnapshot {
  world_id: string
  session_id: string
  prompt: string
  created_at: string
  epoch: number
  navigation: WireNavigation
  trajectory: WireNavigation[]
  checkpoints: WireCheckpoint[]
  recovery: { status: string; error?: string | null; checkpoint_id?: string }
  limits: Record<string, number>
  trajectory_offset?: number
  trajectory_total?: number
  nav_model?: WireNavModel
}

export interface WireNavigationRead {
  world_id: string
  session_id: string
  epoch: number
  navigation: WireNavigation
  trajectory_offset: number
  trajectory_total: number
  trajectory: WireNavigation[]
  recovery_status: string
  nav_model?: WireNavModel
}

export interface WireRestoreResponse {
  session_id: string
  world_id: string
  status: string
  epoch: number
  checkpoint_id: string
  recovery_ms: number
}
