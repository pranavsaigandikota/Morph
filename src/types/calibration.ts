/**
 * Frontend calibration DTOs — user-guided visual capture.
 *
 * Automatic fixed-angle calibration is NO-GO (Codex turn-gain experiments).
 * Suggested direction labels are optional tags, not measured headings.
 *
 * LIVE Capture View reuses spatial-memory checkpoint routes
 * (see docs/ux/CALIBRATION_LIVE_CONTRACT.md). No invented capture endpoints.
 */

/** Optional soft labels for user tagging — not backend-measured bearings. */
export type SuggestedDirectionLabel =
  | 'forward'
  | 'right'
  | 'behind'
  | 'left'
  | 'forward_right'
  | 'forward_left'
  | 'behind_right'
  | 'behind_left'
  | 'unlabeled'

/** Soft suggestions the UI may offer — never used as automatic turn targets. */
export const SUGGESTED_DIRECTION_LABELS: SuggestedDirectionLabel[] = [
  'forward',
  'right',
  'behind',
  'left',
  'unlabeled',
]

export const DIRECTION_LABEL: Record<SuggestedDirectionLabel, string> = {
  forward: 'Forward',
  right: 'Right',
  behind: 'Behind',
  left: 'Left',
  forward_right: 'Forward-right',
  forward_left: 'Forward-left',
  behind_right: 'Behind-right',
  behind_left: 'Behind-left',
  unlabeled: 'No label',
}

export type CalibrationPhase =
  | 'world_created'
  | 'scan_prompt'
  | 'capturing'
  | 'review'
  | 'restoring_seed'
  | 'complete'
  | 'skipped'
  | 'cancelled'

/**
 * Capture provenance.
 * `mock_ui` = frontend simulation or mock-engine checkpoint (never claim LIVE).
 * `live_waypoint` only when a non-mock engine save returns raw frame + SHA-256.
 * Never promote browser screenshots to live_waypoint.
 */
export type CalibrationCaptureSource = 'mock_ui' | 'live_waypoint' | 'unknown'

export type CaptureReviewStatus = 'pending' | 'approved' | 'rejected'

export type CalibrationTransport = 'mock' | 'checkpoint_api'

export interface CalibrationCapture {
  id: string
  /** Optional soft label chosen by the user — not an exact heading. */
  suggestedLabel: SuggestedDirectionLabel
  /** Raw label string sent/stored on the checkpoint (descriptive only). */
  labelText?: string
  /** MOCK data URL or verified backend image URL (raw variant). */
  imageUrl: string
  capturedAtMs: number
  source: CalibrationCaptureSource
  /** LIVE / checkpoint path: SHA-256 of backend raw frame bytes. Null for pure UI MOCK. */
  imageSha256: string | null
  reviewStatus: CaptureReviewStatus
  /** Always null until backend provides verified confidence. */
  confidence: number | null
  /**
   * Layout-only index for MOCK map sketch. Not a measured yaw.
   * Do not treat as physical heading.
   */
  layoutIndex: number
  /** Genuine Waypoint frame id when capture came from checkpoint save. */
  frameId?: number | null
  sessionId?: string | null
  worldId?: string | null
  epoch?: number | null
  /** Estimated navigation segment_id — not a geographic place claim. */
  navigationSegmentId?: string | null
  provenance?: 'initial_seed' | 'raw_video_frame' | null
}

export interface CalibrationSession {
  id: string
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
  phase: CalibrationPhase
  captures: CalibrationCapture[]
  /**
   * `mock` = UI simulation or mock engine.
   * `live` = non-mock engine + checkpoint API successful path.
   */
  source: 'mock' | 'live'
  /** How capture/review/restore are performed. */
  transport: CalibrationTransport
  /** Active world session for checkpoint_api transport. */
  engineSessionId: string | null
  engineIsMock: boolean | null
  /** User must restore original clean seed before explore after calibration. */
  seedRestoreRequired: boolean
  seedRestoreDone: boolean
  /** Epoch observed after successful POST /world/reset (when reported). */
  restoredEpoch: number | null
  createdAtMs: number
  completedAtMs: number | null
  lastError: string | null
  policy: {
    automaticFixedAngleCalibration: 'no-go'
    captureMode: 'user_guided_visual'
  }
}

/** @deprecated Prefer SuggestedDirectionLabel — kept for gallery soft labels. */
export type CalibrationDirection = SuggestedDirectionLabel
