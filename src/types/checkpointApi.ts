/**
 * Checkpoint REST shapes from spatial-memory backend
 * (`feature/worldshift-spatial-memory-backend` → docs/world-memory/API_CONTRACT.md).
 *
 * Capture View reuses these routes — no new calibration capture endpoints.
 */

export type CheckpointProvenance = 'initial_seed' | 'raw_video_frame'

/** Dead-reckoning pose — estimated_units only; not meters or measured camera angles. */
export interface CheckpointNavigation {
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
}

export interface CheckpointQuality {
  status: string
  reviewed: boolean
  approved: boolean
  indicators: Record<string, number>
}

/** Authoritative checkpoint object returned by save / list / get / review. */
export interface BackendCheckpoint {
  checkpoint_id: string
  world_id: string
  session_id: string
  epoch: number
  prompt: string
  frame_id: number | null
  control_seq: number
  created_at: string
  provenance: CheckpointProvenance
  /** User-assigned descriptive label — not a measured heading. */
  label: string
  navigation: CheckpointNavigation
  quality: CheckpointQuality
  image_url: string
  enhanced_image_url: string | null
  enhancement_status: string
  /** SHA-256 of raw image bytes — present on successful save. */
  image_sha256?: string
}

export interface CheckpointListResponse {
  world_id: string
  session_id: string
  checkpoints: BackendCheckpoint[]
}

export interface WorldResetResponse {
  session_id: string
  status: string
  /** Present when backend advances epoch on reset. */
  epoch?: number
  mock?: boolean
}
