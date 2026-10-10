/**
 * LIVE guided calibration CLIENT types
 * (LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md §2.B / §4.1).
 */

import type { SoftLabel } from './wireMemory'

export type CalibrationCaptureKind = 'capture' | 'return_check'

export const LIVE_DEFAULT_PLAN: Array<{
  kind: CalibrationCaptureKind
  direction: SoftLabel
}> = [
  { kind: 'capture', direction: 'forward' },
  { kind: 'capture', direction: 'right' },
  { kind: 'capture', direction: 'left' },
  { kind: 'return_check', direction: 'forward' },
]

export type LiveCalibrationPhase =
  | 'idle'
  | 'checking_capabilities'
  | 'unsupported'
  | 'awaiting_first_frame'
  | 'prompting'
  | 'waiting_for_hold'
  | 'capturing'
  | 'captured'
  | 'review'
  | 'exiting'
  | 'complete'
  | 'skipped'
  | 'aborted'
  | 'error'

export type LiveCalibrationOutcome =
  | null
  | 'completed'
  | 'completed_with_flags'
  | 'cancelled'
  | 'aborted_world_changed'
  | 'aborted_quota'
  | 'aborted_session_lost'
  | 'error'

export interface LiveCalibrationCapture {
  id: string
  kind: CalibrationCaptureKind
  direction: SoftLabel
  softLabel: SoftLabel
  intendedYawDeg: null
  supersededBy: string | null
  source: 'live_waypoint'
  checkpointId: string
  imageUrl: string
  imageSha256: string
  shaVerified: boolean | null
  frameId: number | null
  epoch: number
  capturedAtMs: number
  estimatedYawRad: number
  nominalYawDeltaDeg: null
  inputIdleMsBeforeCapture: number
  confidence: null
  /** CLIENT only — never calls POST /review */
  calibrationReview: 'pending' | 'accepted' | 'rejected' | 'retaken'
  qualityIndicators: { luma_std: number; laplacian_variance: number }
}

export interface LiveCalibrationSession {
  id: string
  mode: 'guided_manual'
  source: 'live'
  sessionId: string
  worldId: string
  epochAtStart: number
  plan: typeof LIVE_DEFAULT_PLAN
  includeBehind: boolean
  holdStillMs: number
  phase: LiveCalibrationPhase
  planIndex: number
  captures: LiveCalibrationCapture[]
  exitAction: 'reset_to_seed'
  outcome: LiveCalibrationOutcome
  turnGainSource: 'none'
  createdAtMs: number
  completedAtMs: number | null
  lastError: string | null
}
