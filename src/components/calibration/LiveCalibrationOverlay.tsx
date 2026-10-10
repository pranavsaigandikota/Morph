/**
 * LIVE guided calibration overlay (contract §4.1).
 * Player turns with normal look controls; Capture after holdStillMs idle.
 * Accept/reject/retake are CLIENT-only (never /review).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  captureCalibrationView,
  createLiveCalibrationSession,
  currentPrompt,
  exitReset,
  markRetaken,
  persistLiveCalibration,
  setCalibrationReview,
} from '../../services/calibration/liveCalibration'
import {
  evaluateMemoryCapabilities,
  fetchEngineHealth,
} from '../../services/worldMemory/capabilities'
import { memoryHttp } from '../../services/worldMemory/memoryHttp'
import type { LiveCalibrationSession } from '../../types/liveCalibration'
import { DIRECTION_LABEL } from '../../types/calibration'

interface Props {
  sessionId: string
  frameWidth: number | null
  frameHeight: number | null
  streamEpoch: number
  /** True when any look/move input is currently active. */
  inputActive: boolean
  onDisableStability: () => void
  onFinished: (outcome: NonNullable<LiveCalibrationSession['outcome']>) => void
  onSkipToExplore: () => void
}

export function LiveCalibrationOverlay({
  sessionId,
  frameWidth,
  frameHeight,
  streamEpoch,
  inputActive,
  onDisableStability,
  onFinished,
  onSkipToExplore,
}: Props) {
  const [session, setSession] = useState<LiveCalibrationSession | null>(null)
  const [idleMs, setIdleMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const lastInputAt = useRef(performance.now())
  const expectedEpoch = useRef<number | null>(null)

  useEffect(() => {
    onDisableStability()
  }, [onDisableStability])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const health = await fetchEngineHealth()
      const frameSize =
        frameWidth != null && frameHeight != null
          ? { width: frameWidth, height: frameHeight }
          : null
      const gate = evaluateMemoryCapabilities(health, frameSize)
      if (cancelled) return
      if (!gate.ok) {
        setSession({
          ...createLiveCalibrationSession({
            sessionId,
            worldId: 'unknown',
            epoch: streamEpoch,
          }),
          phase: 'unsupported',
          lastError: gate.reason,
        })
        return
      }
      try {
        const mem = await memoryHttp.getMemory(sessionId)
        if (cancelled) return
        const s = createLiveCalibrationSession({
          sessionId,
          worldId: mem.world_id,
          epoch: mem.epoch,
        })
        expectedEpoch.current = mem.epoch
        const next = {
          ...s,
          phase: 'awaiting_first_frame' as const,
        }
        setSession(next)
        persistLiveCalibration(next)
      } catch {
        if (cancelled) return
        setSession({
          ...createLiveCalibrationSession({
            sessionId,
            worldId: 'unknown',
            epoch: streamEpoch,
          }),
          phase: 'unsupported',
          lastError: 'Memory unavailable',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, frameWidth, frameHeight, streamEpoch])

  // First frame → prompting
  useEffect(() => {
    if (!session || session.phase !== 'awaiting_first_frame') return
    if (frameWidth === 1280 && frameHeight === 720) {
      const next = { ...session, phase: 'prompting' as const, planIndex: 0 }
      setSession(next)
      persistLiveCalibration(next)
    }
  }, [session, frameWidth, frameHeight])

  // External epoch change → abort
  useEffect(() => {
    if (!session) return
    if (session.phase === 'exiting' || session.phase === 'complete' || session.phase === 'skipped')
      return
    if (expectedEpoch.current == null) return
    if (streamEpoch !== expectedEpoch.current && streamEpoch > expectedEpoch.current) {
      const next: LiveCalibrationSession = {
        ...session,
        phase: 'aborted',
        outcome: 'aborted_world_changed',
        lastError: 'World epoch changed during calibration (reset/restore)',
        completedAtMs: Date.now(),
      }
      setSession(next)
      persistLiveCalibration(next)
      onFinished('aborted_world_changed')
    }
  }, [streamEpoch, session, onFinished])

  // Hold-still timer
  useEffect(() => {
    if (!session) return
    if (session.phase !== 'prompting' && session.phase !== 'waiting_for_hold') return
    const id = window.setInterval(() => {
      if (inputActive) {
        lastInputAt.current = performance.now()
        setIdleMs(0)
        if (session.phase === 'waiting_for_hold') {
          setSession((s) => (s ? { ...s, phase: 'waiting_for_hold' } : s))
        }
        return
      }
      const idle = performance.now() - lastInputAt.current
      setIdleMs(idle)
      if (idle >= session.holdStillMs && session.phase === 'prompting') {
        setSession((s) => {
          if (!s || s.phase !== 'prompting') return s
          const next = { ...s, phase: 'waiting_for_hold' as const }
          persistLiveCalibration(next)
          return next
        })
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [session, inputActive])

  const prompt = useMemo(() => (session ? currentPrompt(session) : null), [session])
  const canCapture =
    !!session &&
    (session.phase === 'waiting_for_hold' || session.phase === 'prompting') &&
    idleMs >= (session?.holdStillMs ?? 1200) &&
    !busy

  const commit = (next: LiveCalibrationSession) => {
    setSession(next)
    persistLiveCalibration(next)
  }

  const onCapture = async () => {
    if (!session || !canCapture) return
    setBusy(true)
    setStatus(null)
    commit({ ...session, phase: 'capturing' })
    const result = await captureCalibrationView(session, idleMs)
    if (!result.ok) {
      if (result.retry === 'abort') {
        commit({
          ...session,
          phase: 'aborted',
          outcome: result.outcome ?? 'error',
          lastError: result.message,
          completedAtMs: Date.now(),
        })
        onFinished(result.outcome ?? 'error')
      } else if (result.retry === 'hold') {
        setStatus(result.message)
        commit({ ...session, phase: 'waiting_for_hold' })
      } else {
        setStatus(result.message)
        commit({ ...session, phase: 'prompting' })
      }
      setBusy(false)
      return
    }
    const retakeId = (window as unknown as { __wsRetakeId?: string }).__wsRetakeId
    let nextSession: LiveCalibrationSession = {
      ...session,
      captures: [...session.captures, result.capture],
      phase: 'captured',
      planIndex: session.planIndex,
    }
    if (retakeId) {
      nextSession = markRetaken(nextSession, retakeId, result.capture)
      ;(window as unknown as { __wsRetakeId?: string }).__wsRetakeId = undefined
    }
    const last = nextSession.planIndex >= nextSession.plan.length - 1
    nextSession = { ...nextSession, phase: last ? 'review' : 'captured' }
    commit(nextSession)
    if (!last) {
      window.setTimeout(() => {
        setSession((s) => {
          if (!s) return s
          const n = {
            ...s,
            phase: 'prompting' as const,
            planIndex: s.planIndex + 1,
          }
          persistLiveCalibration(n)
          return n
        })
      }, 600)
    }
    setBusy(false)
  }

  const finish = async (kind: 'completed' | 'skipped' | 'cancelled') => {
    if (!session) return
    setBusy(true)
    commit({ ...session, phase: 'exiting' })
    const outcome = kind === 'completed' ? 'completed' : 'cancelled'
    if (session.captures.length === 0 && kind !== 'completed') {
      // Skip before first capture — no backend call
      commit({
        ...session,
        phase: 'skipped',
        outcome: 'cancelled',
        completedAtMs: Date.now(),
      })
      setBusy(false)
      onSkipToExplore()
      return
    }
    const reset = await exitReset(session)
    if (!reset.ok) {
      commit({
        ...session,
        phase: 'error',
        outcome: 'error',
        lastError: reset.message ?? 'Reset failed',
        completedAtMs: Date.now(),
      })
      setBusy(false)
      onFinished('error')
      return
    }
    if (typeof reset.epoch === 'number') expectedEpoch.current = reset.epoch
    commit({
      ...session,
      phase: kind === 'completed' ? 'complete' : 'skipped',
      outcome,
      completedAtMs: Date.now(),
    })
    setBusy(false)
    onFinished(outcome)
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-line bg-panel/95 p-4 text-sm text-soft">
        Checking LIVE calibration capabilities…
      </div>
    )
  }

  if (session.phase === 'unsupported') {
    return (
      <div className="rounded-xl border border-hazard/40 bg-hazard/10 p-4 text-sm text-soft">
        <p className="font-semibold text-hazard">Memory unavailable</p>
        <p className="mt-1 text-xs">{session.lastError}</p>
        <p className="mt-2 text-xs text-muted">
          LIVE calibration requires Waypoint-1.5-1B, contract world-memory-v1.1, and 1280×720 frames.
          MOCK demo remains on the separate calibration page.
        </p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold"
          onClick={onSkipToExplore}
        >
          Skip to explore
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-signal/40 bg-panel/95 p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-signal">
          LIVE guided calibration
        </p>
        <span className="rounded border border-ok/40 bg-ok/10 px-1.5 py-0.5 text-[10px] font-bold text-ok">
          LIVE
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Player-driven look · soft labels only · no angles · Stability auto-restore disabled
      </p>

      {prompt && (session.phase === 'prompting' || session.phase === 'waiting_for_hold') && (
        <div className="mt-3 space-y-2">
          <p className="font-display text-lg font-bold text-bright">{prompt.copy}</p>
          <p className="text-xs text-muted">
            Hold still {Math.min(100, Math.round((idleMs / session.holdStillMs) * 100))}% ·{' '}
            {canCapture ? 'Capture ready' : 'Keep holding…'}
          </p>
          <button
            type="button"
            disabled={!canCapture || busy}
            onClick={() => void onCapture()}
            className="rounded-xl bg-signal px-4 py-2 text-sm font-bold text-void disabled:opacity-40"
          >
            {busy ? 'Capturing…' : 'Capture View'}
          </button>
        </div>
      )}

      {session.phase === 'capturing' && (
        <p className="mt-3 text-sm text-soft">Saving genuine Waypoint frame…</p>
      )}

      {status && <p className="mt-2 text-xs text-hazard">{status}</p>}

      {session.captures.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {session.captures.map((c) => (
            <article
              key={c.id}
              className="overflow-hidden rounded-lg border border-line bg-ink"
            >
              <img src={c.imageUrl} alt="" className="aspect-video w-full object-cover" />
              <div className="space-y-1 p-2 text-[11px]">
                <p className="font-semibold text-bright">
                  {DIRECTION_LABEL[c.softLabel] ?? c.softLabel}
                  {c.kind === 'return_check' ? ' · return' : ''}
                </p>
                <p className="text-ok">LIVE Waypoint</p>
                <p className="font-mono text-muted">
                  SHA {c.imageSha256.slice(0, 12)}… ·{' '}
                  {c.shaVerified === true
                    ? 'SHA verified'
                    : c.shaVerified === false
                      ? 'SHA mismatch'
                      : 'SHA pending'}
                </p>
                <p className="text-muted">review: {c.calibrationReview} (client)</p>
                {session.phase === 'review' && c.calibrationReview !== 'retaken' && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      className="rounded border border-ok/40 px-2 py-0.5 text-ok"
                      onClick={() => commit(setCalibrationReview(session, c.id, 'accepted'))}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="rounded border border-danger/40 px-2 py-0.5 text-danger"
                      onClick={() => commit(setCalibrationReview(session, c.id, 'rejected'))}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-0.5 text-soft"
                      disabled={busy}
                      onClick={() => {
                        // Retake: jump plan index to this direction and recapture
                        const idx = session.plan.findIndex(
                          (p) => p.direction === c.direction && p.kind === c.kind,
                        )
                        commit({
                          ...session,
                          phase: 'prompting',
                          planIndex: idx >= 0 ? idx : session.planIndex,
                          lastError: null,
                        })
                        // After capture, markRetaken is applied in onCapture path — handle via effect below
                        ;(window as unknown as { __wsRetakeId?: string }).__wsRetakeId = c.id
                      }}
                    >
                      Retake
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {session.phase === 'review' && (
        <button
          type="button"
          disabled={busy}
          className="mt-4 rounded-xl bg-signal px-4 py-2 text-sm font-bold text-void disabled:opacity-40"
          onClick={() => void finish('completed')}
        >
          {busy ? 'Restoring seed…' : 'Finish & restore clean seed'}
        </button>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted"
          onClick={() => void finish('skipped')}
        >
          Skip
        </button>
        <button
          type="button"
          className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger"
          onClick={() => void finish('cancelled')}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
