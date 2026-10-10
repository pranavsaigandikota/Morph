/**
 * Provisional World Memory models.
 * Authoritative schema: docs/world-memory/API_CONTRACT.md (Codex-owned).
 * Until that lands, treat these as frontend-facing DTOs backed by mocks.
 */

export type MemorySource = 'mock' | 'live'

export type CheckpointStatus =
  | 'capturing'
  | 'available'
  | 'enhancement_queued'
  | 'enhancing'
  | 'enhanced'
  | 'restore_in_progress'
  | 'restored'
  | 'failed'

export type RestorePhase =
  | 'idle'
  | 'preparing'
  | 'reinitializing'
  | 'awaiting_frames'
  | 'complete'
  | 'failed'

/** Arbitrary session frame — not geographic. */
export interface EstimatedPose {
  x: number
  y: number
  headingDeg: number
  uncertainty?: number
  epoch: number
  updatedAtMs: number
}

export interface TrailPoint {
  x: number
  y: number
  headingDeg: number
  atMs: number
  epoch: number
  /** False when continuity across a restore is unknown. */
  continuous: boolean
}

/** Provenance kind for recovery policy. */
export type CheckpointKind = 'sdxl_starter' | 'waypoint_frame' | 'restored' | 'unknown'

export interface Checkpoint {
  id: string
  index: number
  name: string
  capturedAtMs: number
  /** data URL or http(s) URL — only from backend/mock, never invented captions */
  imageUrl: string
  enhancedImageUrl?: string | null
  /**
   * SHA-256 of **original** checkpoint image bytes (provenance for analysis).
   * Never the enhanced candidate hash.
   */
  imageSha256?: string | null
  pose?: EstimatedPose | null
  status: CheckpointStatus
  restorable: boolean
  source: MemorySource
  /** true = user Save View; false = auto mock/backend capture */
  manual: boolean
  /** How this still was produced — drives recovery-anchor policy. */
  kind?: CheckpointKind
  /**
   * false = unsuitable as recovery anchor (e.g. early / blurry Waypoint frame).
   * Default true only for approved SDXL starters / verified scene-start.
   */
  recoverySuitable?: boolean
  unsuitableReason?: string | null
  /**
   * Codex proposal: docs/world-memory/OBSTACLE_SCHEMA_PROPOSAL.md
   * Missing / null ⇒ unsupported or disabled — do not fabricate in LIVE.
   */
  obstacleAnalysis?: ObstacleAnalysis | null
}

/** Aligns with Codex OBSTACLE_SCHEMA_PROPOSAL — not an active API. */
export type ObstacleAnalysisStatus =
  | 'disabled'
  | 'queued'
  | 'running'
  | 'ready'
  | 'error'

export interface ObstacleAnalysis {
  status: ObstacleAnalysisStatus
  job_id?: string | null
  model_revisions?: Record<string, string>
  source_image_sha256: string
  latency_ms?: number | null
  observations: ObstacleObservation[]
}

export interface ObstacleObservation {
  observation_id: string
  source_checkpoint_id: string
  source_image_sha256: string
  label: string
  bbox_normalized: [number, number, number, number]
  direction: {
    screen_x: number
    screen_y: number
    /** null unless backend verified FOV — never invent on the client */
    bearing_rad: number | null
  }
  relative_depth: {
    value: number | null
    units: 'within_image_rank'
    near_is: 'lower' | 'higher'
    scale_scope: 'checkpoint'
    confidence: number | null
  }
  /** Approximate camera-nav association only — not physical world meters. */
  estimated_navigation: {
    x: number
    z: number
    yaw: number
    pitch: number
    segment_id: string | null
    confidence: number | null
  } | null
  /** Always null until Codex provides calibrated world position. */
  estimated_position: null
  detection_score: number
  review_status: 'unreviewed' | 'accepted' | 'rejected'
  limitations: string[]
}

/**
 * Soft UI suggestion only — never collision geometry.
 * Derived from labels for styling; not a Codex wire field.
 */
export type ObstacleSuggestionClass = 'blocked' | 'hazard' | 'walkable_hint' | 'unknown'

export interface RestoreJob {
  checkpointId: string
  phase: RestorePhase
  message: string
  startedAtMs: number
  error?: string | null
}

export interface WorldMemorySession {
  sessionId: string | null
  worldName: string
  promptSummary: string
  source: MemorySource
  pose: EstimatedPose
  trail: TrailPoint[]
  checkpoints: Checkpoint[]
  selectedCheckpointId: string | null
  restore: RestoreJob | null
  enhancementSupported: boolean
}

export interface WorldMemoryClient {
  readonly source: MemorySource
  getSession(): WorldMemorySession
  subscribe(listener: (s: WorldMemorySession) => void): () => void
  /** Bind to an Explorer stream session (or mock). */
  attach(opts: {
    sessionId: string | null
    worldName: string
    promptSummary: string
    epoch: number
  }): void
  detach(): void
  /**
   * Provisional local estimate driver for MOCK only.
   * LIVE client must no-op (never estimate from controls).
   */
  noteControlHint?(hint: { keys: string[]; mouseDx: number; mouseDy: number }): void
  saveView(): Promise<Checkpoint | null>
  selectCheckpoint(id: string | null): void
  restoreCheckpoint(id: string): Promise<void>
  /** Recovery-anchor approval (LIVE). Never used for calibration acceptance. */
  reviewCheckpoint?(
    id: string,
    approved: boolean,
    extra?: { reviewer?: string; reason?: string },
  ): Promise<void>
  /** Optional seed reset via memory client (LIVE). Explorer still uses stream reset. */
  refreshWorld?(): Promise<void>
  centerOnPlayerRequested(): boolean
  consumeCenterRequest(): void
  requestCenterOnPlayer?(): void
}
