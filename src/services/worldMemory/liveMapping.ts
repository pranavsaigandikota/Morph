/**
 * Pure LIVE memory mapping helpers (unit-tested).
 * Axes: uiX=x, uiY=-z, headingDeg=deg(yaw) mod 360.
 * Trail breaks on segment_id change. Stale epochs discarded.
 */

import { isRecoveryAnchorAllowed } from '../hqStarterCandidates'
import type {
  Checkpoint,
  EstimatedPose,
  TrailPoint,
} from '../../types/worldMemory'
import type { WireCheckpoint, WireNavigation } from '../../types/wireMemory'

export type ConfidenceBand = 'high' | 'medium' | 'low'

export function yawToHeadingDeg(yawRad: number): number {
  const deg = (yawRad * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

export function navToUiPose(nav: WireNavigation, updatedAtMs: number): EstimatedPose {
  return {
    x: nav.x,
    y: -nav.z,
    headingDeg: yawToHeadingDeg(nav.yaw),
    // No data-sized uncertainty ring in LIVE (K7 unavailable).
    uncertainty: undefined,
    epoch: nav.epoch,
    updatedAtMs,
  }
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.7) return 'high'
  if (confidence >= 0.35) return 'medium'
  return 'low'
}

export function shouldDiscardStaleEpoch(
  snapshotEpoch: number,
  lastAppliedEpoch: number,
): boolean {
  return snapshotEpoch < lastAppliedEpoch
}

/**
 * Append trajectory points by absolute index.
 * Points with index < trajectory_since are ignored by the caller (slice).
 * continuous:false when segment_id changes from the previous trail point.
 */
export function appendTrajectoryPoints(
  existing: TrailPoint[],
  points: WireNavigation[],
  opts: { absoluteStartIndex: number },
): TrailPoint[] {
  if (points.length === 0) return existing
  const out = existing.slice()
  let prevSegment =
    out.length > 0 ? (out[out.length - 1] as TrailPoint & { segmentId?: string }).segmentId : null

  // Recover segment from relationship markers if we stored it on the point via tag.
  // TrailPoint has no segmentId field — track via continuous breaks + parallel array in client.
  // Here we only set continuous based on successive wire points + last known segment.
  for (let i = 0; i < points.length; i++) {
    const nav = points[i]!
    const absIndex = opts.absoluteStartIndex + i
    void absIndex
    const continuous =
      prevSegment != null && prevSegment === nav.segment_id && nav.relationship !== 'restored_view'
    const ui = navToUiPose(nav, nav.server_elapsed_ms)
    out.push({
      x: ui.x,
      y: ui.y,
      headingDeg: ui.headingDeg,
      atMs: nav.server_elapsed_ms,
      epoch: nav.epoch,
      continuous: out.length === 0 ? true : continuous,
    })
    prevSegment = nav.segment_id
  }
  return out
}

/** Same as appendTrajectoryPoints but tracks segment ids explicitly. */
export function mergeTrajectoryByAbsoluteIndex(
  state: {
    trail: TrailPoint[]
    lastSegmentId: string | null
    nextAbsoluteIndex: number
  },
  payload: {
    trajectory_offset: number
    trajectory_total: number
    trajectory: WireNavigation[]
  },
): {
  trail: TrailPoint[]
  lastSegmentId: string | null
  nextAbsoluteIndex: number
} {
  const { trajectory_offset, trajectory, trajectory_total } = payload
  // Only append points at or after nextAbsoluteIndex.
  const skip = Math.max(0, state.nextAbsoluteIndex - trajectory_offset)
  const fresh = trajectory.slice(skip)
  if (fresh.length === 0) {
    return {
      ...state,
      nextAbsoluteIndex: Math.max(state.nextAbsoluteIndex, trajectory_total),
    }
  }

  let lastSegmentId = state.lastSegmentId
  const trail = state.trail.slice()
  for (const nav of fresh) {
    const continuous =
      lastSegmentId != null &&
      lastSegmentId === nav.segment_id &&
      nav.relationship !== 'restored_view' &&
      nav.relationship !== 'new_unknown'
    const ui = navToUiPose(nav, nav.server_elapsed_ms)
    trail.push({
      x: ui.x,
      y: ui.y,
      headingDeg: ui.headingDeg,
      atMs: nav.server_elapsed_ms,
      epoch: nav.epoch,
      continuous: trail.length === 0 ? true : continuous,
    })
    lastSegmentId = nav.segment_id
  }
  return {
    trail: trail.slice(-2048),
    lastSegmentId,
    nextAbsoluteIndex: trajectory_offset + trajectory.length,
  }
}

export function checkpointKindFromReason(
  reason: WireCheckpoint['capture_reason'] | undefined,
  provenance: WireCheckpoint['provenance'],
): Checkpoint['kind'] {
  if (reason === 'initial_seed' || provenance === 'initial_seed') return 'sdxl_starter'
  return 'waypoint_frame'
}

export function mapWireCheckpoint(
  cp: WireCheckpoint,
  index: number,
  engineHttpBase: string,
): Checkpoint {
  const kind = checkpointKindFromReason(cp.capture_reason, cp.provenance)
  const hasPose =
    cp.navigation != null &&
    Number.isFinite(cp.navigation.x) &&
    Number.isFinite(cp.navigation.z)
  const pose = hasPose ? navToUiPose(cp.navigation, Date.parse(cp.created_at) || Date.now()) : null

  const policyOk = isRecoveryAnchorAllowed({ kind, restorable: true })
  const recoverySuitable = Boolean(cp.quality?.approved) && policyOk
  const relative = cp.image_url?.startsWith('/')
    ? cp.image_url
    : `/world/checkpoints/${cp.checkpoint_id}/image?session_id=${encodeURIComponent(cp.session_id)}&variant=raw`
  const imageUrl = relative.startsWith('http') ? relative : `${engineHttpBase}${relative}`

  return {
    id: cp.checkpoint_id,
    index,
    name: cp.label || (index === 0 ? 'Start' : `View ${index}`),
    capturedAtMs: Date.parse(cp.created_at) || Date.now(),
    imageUrl,
    enhancedImageUrl: null,
    imageSha256: cp.image_sha256 ?? null,
    pose,
    status: 'available',
    restorable: recoverySuitable,
    source: 'live',
    manual: cp.capture_reason === 'manual',
    kind,
    recoverySuitable,
    unsuitableReason: recoverySuitable
      ? null
      : kind === 'waypoint_frame'
        ? 'Waypoint frames are not recovery anchors under the strict starter policy. Approve an SDXL seed (initial_seed) or use Refresh World.'
        : cp.quality?.approved
          ? null
          : 'Not approved as a recovery anchor yet.',
    obstacleAnalysis: null,
  }
}

/** Skip map markers when checkpoint has no pose — never fall back to (0,0). */
export function checkpointsWithPose(checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.filter((c) => c.pose != null)
}

export function restoreBannerText(nav: WireNavigation | null | undefined): string | null {
  if (!nav?.anchor_kind) return null
  if (nav.anchor_kind === 'checkpoint_restore') {
    const id = nav.restored_from_checkpoint_id
    return id ? `↺ restored from ${id.slice(0, 8)}…` : '↺ restored from checkpoint'
  }
  if (nav.anchor_kind === 'reset_to_seed') return '↺ reset to start'
  if (nav.anchor_kind === 'world_start') return null
  return null
}

/** Soft prompt copy — never degrees. */
export function softTurnPrompt(label: SoftLabelLike): string {
  const map: Record<string, string> = {
    forward: 'FORWARD',
    right: 'RIGHT',
    left: 'LEFT',
    behind: 'BEHIND',
    forward_right: 'FORWARD-RIGHT',
    forward_left: 'FORWARD-LEFT',
    behind_right: 'BEHIND-RIGHT',
    behind_left: 'BEHIND-LEFT',
    unlabeled: 'any direction you choose',
  }
  const word = map[label] ?? 'that direction'
  return `Turn to roughly your ${word}, then hold still`
}

type SoftLabelLike = string
