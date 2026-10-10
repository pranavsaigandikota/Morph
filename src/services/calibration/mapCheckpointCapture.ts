/**
 * Map backend Checkpoint → CalibrationCapture.
 * LIVE provenance only when engine is non-mock and save returns raw frame + SHA.
 */

import type { BackendCheckpoint } from '../../types/checkpointApi'
import type {
  CalibrationCapture,
  CaptureReviewStatus,
  SuggestedDirectionLabel,
} from '../../types/calibration'
import { SUGGESTED_DIRECTION_LABELS } from '../../types/calibration'
import { engineHttpBase } from '../engineConfig'

export function labelToSuggested(
  label: string | undefined | null,
): SuggestedDirectionLabel {
  if (!label) return 'unlabeled'
  const normalized = label.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((SUGGESTED_DIRECTION_LABELS as string[]).includes(normalized)) {
    return normalized as SuggestedDirectionLabel
  }
  // Custom free-text labels stay unlabeled in the soft-tag enum; raw text kept on capture.
  return 'unlabeled'
}

export function suggestedToSaveLabel(label: SuggestedDirectionLabel): string {
  if (label === 'unlabeled') return 'Manual checkpoint'
  return label
}

export function reviewFromQuality(
  quality: BackendCheckpoint['quality'],
): CaptureReviewStatus {
  if (!quality.reviewed) return 'pending'
  return quality.approved ? 'approved' : 'rejected'
}

/**
 * @param engineIsMock — from /health.mock === true. Mock engines never claim live_waypoint.
 */
export function mapCheckpointToCapture(
  cp: BackendCheckpoint,
  opts: {
    engineIsMock: boolean
    layoutIndex: number
    suggestedLabel?: SuggestedDirectionLabel
  },
): CalibrationCapture {
  const sha = cp.image_sha256 ?? null
  const liveEligible =
    !opts.engineIsMock &&
    sha != null &&
    sha.length === 64 &&
    (cp.provenance === 'raw_video_frame' || cp.provenance === 'initial_seed')

  const capturedAtMs = Date.parse(cp.created_at)
  const relative =
    cp.image_url?.startsWith('/')
      ? cp.image_url
      : `/world/checkpoints/${cp.checkpoint_id}/image?session_id=${encodeURIComponent(cp.session_id)}&variant=raw`
  const base = engineHttpBase()
  const imageUrl = relative.startsWith('http')
    ? relative
    : `${base}${relative}`
  return {
    id: cp.checkpoint_id,
    suggestedLabel:
      opts.suggestedLabel ?? labelToSuggested(cp.label),
    /** Soft free-text as stored on the checkpoint — not a measured angle. */
    labelText: cp.label,
    imageUrl,
    capturedAtMs: Number.isFinite(capturedAtMs) ? capturedAtMs : Date.now(),
    source: liveEligible ? 'live_waypoint' : 'mock_ui',
    imageSha256: sha,
    reviewStatus: reviewFromQuality(cp.quality),
    confidence: null,
    layoutIndex: opts.layoutIndex,
    frameId: cp.frame_id,
    sessionId: cp.session_id,
    worldId: cp.world_id,
    epoch: cp.epoch,
    navigationSegmentId: cp.navigation?.segment_id ?? null,
    provenance: cp.provenance,
  }
}
