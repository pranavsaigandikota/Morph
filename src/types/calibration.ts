/**
 * Frontend calibration DTOs — user-guided visual capture (MOCK shell).
 *
 * Automatic fixed-angle calibration is NO-GO (Codex turn-gain experiments).
 * Suggested direction labels are optional tags, not measured headings.
 * Claude owns the LIVE contract; no capture endpoints invented here.
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
 * `mock_ui` = frontend simulation only.
 * `live_waypoint` only when a verified backend capture API returns raw frame + SHA.
 * Never promote browser screenshots to live_waypoint.
 */
export type CalibrationCaptureSource = 'mock_ui' | 'live_waypoint' | 'unknown'

export type CaptureReviewStatus = 'pending' | 'approved' | 'rejected'

export interface CalibrationCapture {
  id: string
  /** Optional soft label chosen by the user — not an exact heading. */
  suggestedLabel: SuggestedDirectionLabel
  /** MOCK data URL or future verified backend image URL. */
  imageUrl: string
  capturedAtMs: number
  source: CalibrationCaptureSource
  /** LIVE only: SHA-256 of backend raw frame bytes. Null for MOCK. */
  imageSha256: string | null
  reviewStatus: CaptureReviewStatus
  /** Always null until backend provides verified confidence. */
  confidence: number | null
  /**
   * Layout-only index for MOCK map sketch. Not a measured yaw.
   * Do not treat as physical heading.
   */
  layoutIndex: number
}

export interface CalibrationSession {
  id: string
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
  phase: CalibrationPhase
  captures: CalibrationCapture[]
  /** Always mock until verified capture API is wired. */
  source: 'mock'
  /** User must restore original clean seed before explore after calibration. */
  seedRestoreRequired: boolean
  seedRestoreDone: boolean
  createdAtMs: number
  completedAtMs: number | null
  policy: {
    automaticFixedAngleCalibration: 'no-go'
    captureMode: 'user_guided_visual'
  }
}

/** @deprecated Prefer SuggestedDirectionLabel — kept for gallery soft labels. */
export type CalibrationDirection = SuggestedDirectionLabel
