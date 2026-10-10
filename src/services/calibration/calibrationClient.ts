/**
 * Calibration client facade.
 *
 * LIVE path reuses existing checkpoint + reset APIs (no new capture routes).
 * MOCK path keeps the UI simulation when no engine session / checkpoint API.
 *
 * Boundary:
 * - source live_waypoint only when /health.mock !== true AND save returns SHA + raw provenance
 * - mock engines that expose checkpoint routes stay mock_ui / source:mock
 */

import type {
  CalibrationCapture,
  CalibrationSession,
  SuggestedDirectionLabel,
} from '../../types/calibration'
import { worldApi } from '../worldApi'
import { checkpointApi } from './checkpointApi'
import {
  createMockCalibrationSession,
  mockCaptureCurrentView,
  mockRestoreOriginalSeed,
} from './mockCalibration'
import {
  mapCheckpointToCapture,
  suggestedToSaveLabel,
} from './mapCheckpointCapture'

export type CalibrationMode = 'mock_ui' | 'checkpoint_api'

export async function resolveCalibrationMode(opts: {
  engineSessionId: string | null
}): Promise<{
  mode: CalibrationMode
  engineIsMock: boolean
  checkpointsAvailable: boolean
}> {
  const probe = await worldApi.probe()
  const engineIsMock = probe.mock === true || !probe.ok
  if (!opts.engineSessionId || !probe.ok) {
    return { mode: 'mock_ui', engineIsMock: true, checkpointsAvailable: false }
  }
  const checkpointsAvailable = await checkpointApi.capabilities(opts.engineSessionId)
  if (!checkpointsAvailable) {
    return { mode: 'mock_ui', engineIsMock, checkpointsAvailable: false }
  }
  return { mode: 'checkpoint_api', engineIsMock, checkpointsAvailable: true }
}

/**
 * Ensure an engine session exists for checkpoint_api transport.
 * Starts world when missing. Does not invent frames — Capture View still needs
 * a generated JPEG (or mock snapshot) before save succeeds.
 */
export async function ensureCalibrationEngineSession(
  session: CalibrationSession,
): Promise<CalibrationSession> {
  if (session.engineSessionId) {
    const resolved = await resolveCalibrationMode({
      engineSessionId: session.engineSessionId,
    })
    return {
      ...session,
      transport: resolved.mode === 'checkpoint_api' ? 'checkpoint_api' : 'mock',
      engineIsMock: resolved.engineIsMock,
      source: resolved.engineIsMock || resolved.mode === 'mock_ui' ? 'mock' : 'live',
      lastError: null,
    }
  }

  const probe = await worldApi.probe()
  if (!probe.ok) {
    return {
      ...session,
      transport: 'mock',
      engineIsMock: true,
      source: 'mock',
      lastError: null,
    }
  }

  try {
    const started = await worldApi.start(
      session.worldPrompt,
      session.sceneSeed,
    )
    const engineSessionId = started.session_id
    const resolved = await resolveCalibrationMode({ engineSessionId })
    return {
      ...session,
      engineSessionId,
      transport: resolved.mode === 'checkpoint_api' ? 'checkpoint_api' : 'mock',
      engineIsMock: resolved.engineIsMock,
      source: resolved.engineIsMock || resolved.mode === 'mock_ui' ? 'mock' : 'live',
      lastError: null,
    }
  } catch (err) {
    return {
      ...session,
      transport: 'mock',
      engineIsMock: true,
      source: 'mock',
      lastError: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function captureView(
  session: CalibrationSession,
  suggestedLabel: SuggestedDirectionLabel = 'unlabeled',
): Promise<{ session: CalibrationSession; capture: CalibrationCapture }> {
  if (session.transport !== 'checkpoint_api' || !session.engineSessionId) {
    const capture = mockCaptureCurrentView(session, suggestedLabel)
    return {
      session: { ...session, source: 'mock', lastError: null },
      capture,
    }
  }

  try {
    const cp = await checkpointApi.save(
      session.engineSessionId,
      suggestedToSaveLabel(suggestedLabel),
    )
    const capture = mapCheckpointToCapture(cp, {
      engineIsMock: session.engineIsMock === true,
      layoutIndex: session.captures.length,
      suggestedLabel,
    })
    const anyLive = capture.source === 'live_waypoint'
    return {
      session: {
        ...session,
        source: anyLive ? 'live' : 'mock',
        lastError: null,
      },
      capture,
    }
  } catch (err) {
    // Fail closed to MOCK UI — never launder a failure as LIVE.
    const capture = mockCaptureCurrentView(session, suggestedLabel)
    return {
      session: {
        ...session,
        source: 'mock',
        lastError: err instanceof Error ? err.message : String(err),
      },
      capture,
    }
  }
}

/**
 * Persist approve/reject via checkpoint review when transport is checkpoint_api.
 * Image bytes / SHA are never modified by review.
 */
export async function persistReview(
  session: CalibrationSession,
  captureId: string,
  approved: boolean,
): Promise<CalibrationSession> {
  const local: CalibrationSession = {
    ...session,
    captures: session.captures.map((c) =>
      c.id === captureId
        ? { ...c, reviewStatus: approved ? 'approved' : 'rejected' }
        : c,
    ),
  }

  if (session.transport !== 'checkpoint_api' || !session.engineSessionId) {
    return { ...local, lastError: null }
  }

  try {
    const updated = await checkpointApi.review(
      session.engineSessionId,
      captureId,
      approved,
    )
    const mapped = mapCheckpointToCapture(updated, {
      engineIsMock: session.engineIsMock === true,
      layoutIndex:
        session.captures.find((c) => c.id === captureId)?.layoutIndex ?? 0,
      suggestedLabel: session.captures.find((c) => c.id === captureId)
        ?.suggestedLabel,
    })
    return {
      ...local,
      captures: local.captures.map((c) =>
        c.id === captureId
          ? {
              ...c,
              reviewStatus: mapped.reviewStatus,
              // Preserve image evidence fields; review must not rewrite them.
              imageSha256: c.imageSha256 ?? mapped.imageSha256,
              imageUrl: c.imageUrl,
              frameId: c.frameId ?? mapped.frameId,
              worldId: c.worldId ?? mapped.worldId,
              epoch: c.epoch ?? mapped.epoch,
              navigationSegmentId:
                c.navigationSegmentId ?? mapped.navigationSegmentId,
              provenance: c.provenance ?? mapped.provenance,
            }
          : c,
      ),
      lastError: null,
    }
  } catch (err) {
    return {
      ...local,
      lastError: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Restore original clean seed before explore.
 * LIVE / checkpoint_api → POST /world/reset (validated lifecycle).
 * MOCK UI → timed stand-in.
 */
export async function restoreOriginalSeed(
  session: CalibrationSession,
): Promise<CalibrationSession> {
  if (session.transport !== 'checkpoint_api' || !session.engineSessionId) {
    await mockRestoreOriginalSeed()
    return {
      ...session,
      seedRestoreDone: true,
      restoredEpoch: null,
      lastError: null,
    }
  }

  try {
    const result = await checkpointApi.resetWorld(session.engineSessionId)
    return {
      ...session,
      seedRestoreDone: true,
      restoredEpoch:
        typeof result.epoch === 'number' ? result.epoch : null,
      lastError: null,
    }
  } catch (err) {
    return {
      ...session,
      seedRestoreDone: false,
      lastError: err instanceof Error ? err.message : String(err),
    }
  }
}

export function createCalibrationSession(opts: {
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
  engineSessionId?: string | null
}): CalibrationSession {
  const base = createMockCalibrationSession(opts)
  if (opts.engineSessionId) {
    return {
      ...base,
      engineSessionId: opts.engineSessionId,
      transport: 'checkpoint_api',
      engineIsMock: null,
      source: 'mock',
    }
  }
  return base
}
