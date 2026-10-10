/**
 * LIVE guided calibration helpers (contract §4.1).
 * Calibration acceptance is CLIENT-only — never calls /world/checkpoints/.../review.
 */

import { engineHttpBase } from '../engineConfig'
import { memoryHttp, MemoryHttpError } from '../worldMemory/memoryHttp'
import { softTurnPrompt } from '../worldMemory/liveMapping'
import type { SoftLabel, WireCheckpoint } from '../../types/wireMemory'
import type {
  CalibrationCaptureKind,
  LiveCalibrationCapture,
  LiveCalibrationSession,
} from '../../types/liveCalibration'
import { LIVE_DEFAULT_PLAN } from '../../types/liveCalibration'

const STORAGE_KEY = 'ws_live_calibration_v1'

export function newCalibrationId(): string {
  const s = Math.random().toString(36).slice(2) + Date.now().toString(36)
  return s.replace(/[^a-z0-9]/g, '').slice(0, 12).padEnd(6, 'a')
}

export function createLiveCalibrationSession(opts: {
  sessionId: string
  worldId: string
  epoch: number
  includeBehind?: boolean
}): LiveCalibrationSession {
  const plan = opts.includeBehind
    ? [
        ...LIVE_DEFAULT_PLAN.slice(0, 3),
        { kind: 'capture' as const, direction: 'behind' as SoftLabel },
        LIVE_DEFAULT_PLAN[3]!,
      ]
    : LIVE_DEFAULT_PLAN
  return {
    id: newCalibrationId(),
    mode: 'guided_manual',
    source: 'live',
    sessionId: opts.sessionId,
    worldId: opts.worldId,
    epochAtStart: opts.epoch,
    plan,
    includeBehind: Boolean(opts.includeBehind),
    holdStillMs: 1200,
    phase: 'checking_capabilities',
    planIndex: 0,
    captures: [],
    exitAction: 'reset_to_seed',
    outcome: null,
    turnGainSource: 'none',
    createdAtMs: Date.now(),
    completedAtMs: null,
    lastError: null,
  }
}

export function persistLiveCalibration(session: LiveCalibrationSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function loadLiveCalibration(): LiveCalibrationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LiveCalibrationSession
  } catch {
    return null
  }
}

export function clearLiveCalibration(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function currentPrompt(session: LiveCalibrationSession): {
  kind: CalibrationCaptureKind
  direction: SoftLabel
  copy: string
} | null {
  const step = session.plan[session.planIndex]
  if (!step) return null
  return {
    kind: step.kind,
    direction: step.direction,
    copy:
      step.kind === 'return_check'
        ? 'Turn back to roughly your FORWARD (return check), then hold still'
        : softTurnPrompt(step.direction),
  }
}

export async function verifyImageSha256(
  imageUrl: string,
  expectedSha: string,
): Promise<boolean> {
  const res = await fetch(imageUrl)
  if (!res.ok) return false
  const buf = await res.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex === expectedSha.toLowerCase()
}

function mapCapture(
  cp: WireCheckpoint,
  opts: {
    kind: CalibrationCaptureKind
    direction: SoftLabel
    idleMs: number
  },
): LiveCalibrationCapture {
  const base = engineHttpBase()
  const relative = cp.image_url.startsWith('/')
    ? cp.image_url
    : `/world/checkpoints/${cp.checkpoint_id}/image?session_id=${encodeURIComponent(cp.session_id)}&variant=raw`
  const imageUrl = relative.startsWith('http') ? relative : `${base}${relative}`
  return {
    id: cp.checkpoint_id,
    kind: opts.kind,
    direction: opts.direction,
    softLabel: opts.direction,
    intendedYawDeg: null,
    supersededBy: null,
    source: 'live_waypoint',
    checkpointId: cp.checkpoint_id,
    imageUrl,
    imageSha256: cp.image_sha256,
    shaVerified: null,
    frameId: cp.frame_id,
    epoch: cp.epoch,
    capturedAtMs: Date.parse(cp.created_at) || Date.now(),
    estimatedYawRad: cp.navigation?.yaw ?? 0,
    nominalYawDeltaDeg: null,
    inputIdleMsBeforeCapture: opts.idleMs,
    confidence: null,
    calibrationReview: 'pending',
    qualityIndicators: {
      luma_std: Number(cp.quality?.indicators?.luma_std ?? 0),
      laplacian_variance: Number(cp.quality?.indicators?.laplacian_variance ?? 0),
    },
  }
}

export type CaptureResult =
  | { ok: true; capture: LiveCalibrationCapture }
  | { ok: false; retry: 'hold' | 'prompt' | 'abort'; message: string; outcome?: LiveCalibrationSession['outcome'] }

export async function captureCalibrationView(
  session: LiveCalibrationSession,
  idleMs: number,
): Promise<CaptureResult> {
  const step = session.plan[session.planIndex]
  if (!step) {
    return { ok: false, retry: 'abort', message: 'No plan step', outcome: 'error' }
  }
  try {
    const cp = await memoryHttp.saveCheckpoint(session.sessionId, {
      label: `calibration:${session.id}:${step.kind}:${step.direction}`.slice(0, 100),
      capture_reason: 'calibration',
      calibration: {
        calibration_id: session.id,
        kind: step.kind,
        soft_label: step.direction,
      },
    })
    const capture = mapCapture(cp, {
      kind: step.kind,
      direction: step.direction,
      idleMs,
    })
    try {
      capture.shaVerified = await verifyImageSha256(capture.imageUrl, capture.imageSha256)
    } catch {
      capture.shaVerified = false
    }
    return { ok: true, capture }
  } catch (err) {
    if (err instanceof MemoryHttpError) {
      if (err.status === 409) {
        return { ok: false, retry: 'hold', message: 'No generated frame yet — hold still and retry' }
      }
      if (err.status === 422) {
        return { ok: false, retry: 'prompt', message: 'Frame was blank; try again' }
      }
      if (err.status === 507) {
        return {
          ok: false,
          retry: 'abort',
          message: 'Checkpoint quota (32) reached — calibration aborted',
          outcome: 'aborted_quota',
        }
      }
      if (err.status === 404) {
        return {
          ok: false,
          retry: 'abort',
          message: 'Session lost',
          outcome: 'aborted_session_lost',
        }
      }
    }
    return {
      ok: false,
      retry: 'abort',
      message: err instanceof Error ? err.message : String(err),
      outcome: 'error',
    }
  }
}

/** CLIENT-only accept/reject — never calls /review. */
export function setCalibrationReview(
  session: LiveCalibrationSession,
  captureId: string,
  review: 'accepted' | 'rejected',
): LiveCalibrationSession {
  return {
    ...session,
    captures: session.captures.map((c) =>
      c.id === captureId ? { ...c, calibrationReview: review } : c,
    ),
  }
}

/** Retake: new capture; mark old as retaken and keep evidence. */
export function markRetaken(
  session: LiveCalibrationSession,
  oldId: string,
  newCapture: LiveCalibrationCapture,
): LiveCalibrationSession {
  return {
    ...session,
    captures: [
      ...session.captures.map((c) =>
        c.id === oldId
          ? { ...c, calibrationReview: 'retaken' as const, supersededBy: newCapture.id }
          : c,
      ),
      newCapture,
    ],
  }
}

export async function exitReset(session: LiveCalibrationSession): Promise<{
  ok: boolean
  epoch?: number
  message?: string
}> {
  try {
    const r = await memoryHttp.resetWorld(session.sessionId)
    return { ok: true, epoch: r.epoch }
  } catch (err) {
    if (err instanceof MemoryHttpError && err.status === 503) {
      return { ok: false, message: 'Reset failed — start a new world' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Guard: request bodies for calibration must never include accept_unreviewed or angle fields. */
export function assertNoAngleOrUnreviewed(body: unknown): void {
  const s = JSON.stringify(body)
  if (/accept_unreviewed/i.test(s)) throw new Error('accept_unreviewed forbidden')
  if (/"yaw_deg"|"intendedYawDeg"|"angle_deg"|"degrees"/i.test(s)) {
    throw new Error('angle fields forbidden in calibration requests')
  }
}
