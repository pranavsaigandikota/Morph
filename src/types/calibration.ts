/**
 * Frontend calibration DTOs — UI shell only.
 * Claude owns the memory/calibration architecture; no backend endpoints invented here.
 */

/** Extensible for eight directions later — do not assume backend support. */
export type CalibrationDirection =
  | 'forward'
  | 'right'
  | 'behind'
  | 'left'
  | 'forward_right'
  | 'forward_left'
  | 'behind_right'
  | 'behind_left'

/** Default first-person quad used in the UI today. */
export const CALIBRATION_QUAD: CalibrationDirection[] = [
  'forward',
  'right',
  'behind',
  'left',
]

export const DIRECTION_LABEL: Record<CalibrationDirection, string> = {
  forward: 'Forward',
  right: 'Right',
  behind: 'Behind',
  left: 'Left',
  forward_right: 'Forward-right',
  forward_left: 'Forward-left',
  behind_right: 'Behind-right',
  behind_left: 'Behind-left',
}

/** Approximate yaw offset (degrees) for map sketch — estimated, not physical. */
export const DIRECTION_YAW_DEG: Record<CalibrationDirection, number> = {
  forward: 0,
  right: 90,
  behind: 180,
  left: 270,
  forward_right: 45,
  forward_left: 315,
  behind_right: 135,
  behind_left: 225,
}

export type CalibrationPhase =
  | 'world_created'
  | 'scan_prompt'
  | 'capturing'
  | 'review'
  | 'complete'
  | 'skipped'

export type CalibrationCaptureSource = 'mock_ui' | 'live_waypoint' | 'unknown'

export interface CalibrationCapture {
  id: string
  direction: CalibrationDirection
  /** MOCK data URLs or future live frame URLs — never invent live provenance. */
  imageUrl: string
  capturedAtMs: number
  source: CalibrationCaptureSource
  /** Soft UI confidence for MOCK demos only; LIVE must come from backend. */
  confidence: number | null
  reviewStatus: 'pending' | 'accepted' | 'rejected'
  yawDeg: number
}

export interface CalibrationSession {
  id: string
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
  phase: CalibrationPhase
  plannedDirections: CalibrationDirection[]
  captures: CalibrationCapture[]
  source: 'mock'
  createdAtMs: number
  completedAtMs: number | null
}
