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

export interface Checkpoint {
  id: string
  index: number
  name: string
  capturedAtMs: number
  /** data URL or http(s) URL — only from backend/mock, never invented captions */
  imageUrl: string
  enhancedImageUrl?: string | null
  pose?: EstimatedPose | null
  status: CheckpointStatus
  restorable: boolean
  source: MemorySource
  /** true = user Save View; false = auto mock/backend capture */
  manual: boolean
  /**
   * AI-inferred obstacles near this checkpoint (Codex schema when live).
   * Never treat as verified collision geometry.
   */
  obstacles?: InferredObstacle[]
}

/**
 * Provisional obstacle observation — replace fields when Codex publishes the
 * authoritative schema in docs/world-memory/API_CONTRACT.md.
 */
export type ObstacleKind = 'blocked' | 'hazard' | 'walkable_hint'

export interface InferredObstacle {
  id: string
  checkpointId: string
  kind: ObstacleKind
  /** Relative bearing from checkpoint pose, degrees in session frame. */
  directionDeg: number
  /** Approximate distance in session units (not meters unless Codex says so). */
  relativeDistance: number
  /** 0–1; style opacity/dash from this. */
  confidence: number
  /** Optional footprint radius for map glyph. */
  radius?: number
  label?: string
  source: MemorySource
}

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
   * Live client must ignore this and wait for Codex navigation events.
   */
  noteControlHint?(hint: { keys: string[]; mouseDx: number; mouseDy: number }): void
  saveView(): Promise<Checkpoint | null>
  selectCheckpoint(id: string | null): void
  restoreCheckpoint(id: string): Promise<void>
  centerOnPlayerRequested(): boolean
  consumeCenterRequest(): void
}
