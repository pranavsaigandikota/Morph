import { useMemo, useState } from 'react'
import {
  DIRECTION_LABEL,
  SUGGESTED_DIRECTION_LABELS,
  type CalibrationCapture,
  type CalibrationPhase,
  type CalibrationSession,
  type SuggestedDirectionLabel,
} from '../../types/calibration'
import {
  captureView as clientCaptureView,
  ensureCalibrationEngineSession,
  persistReview,
  restoreOriginalSeed,
} from '../../services/calibration/calibrationClient'
import { persistCalibrationSession } from '../../services/calibration/mockCalibration'

interface Props {
  session: CalibrationSession
  onSessionChange: (s: CalibrationSession) => void
  onStartExploring: (session: CalibrationSession) => void
  onSkip: (session: CalibrationSession) => void
  onCancel: () => void
}

const STEPS: Array<{ phase: CalibrationPhase; title: string; body: string }> = [
  {
    phase: 'world_created',
    title: 'World created',
    body: 'Your seed is ready. Optional calibration saves views you choose while looking around — no automatic fixed-angle turns.',
  },
  {
    phase: 'scan_prompt',
    title: 'Scan surroundings',
    body: 'Manually look around with mouse / WASD when LIVE stream is available. Automatic preset-degree rotation is NO-GO.',
  },
  {
    phase: 'capturing',
    title: 'Capture views',
    body: 'Capture View calls POST /world/checkpoints/save for the current genuine engine frame when a session exists. Without that API, captures stay MOCK UI simulations — not browser screenshots of LIVE.',
  },
  {
    phase: 'review',
    title: 'Review captures',
    body: 'Approve, reject, or retake each thumbnail. Suggested directions are optional labels, not measured headings. Review persists quality flags only — image SHA is unchanged.',
  },
  {
    phase: 'restoring_seed',
    title: 'Restore clean seed',
    body: 'Before exploration, POST /world/reset restores the original clean seed: advances epoch, clears controls, discards stale frames.',
  },
  {
    phase: 'complete',
    title: 'Calibration complete',
    body: 'Seed restored. You can start exploring from the clean original image.',
  },
]

function transportBadge(session: CalibrationSession): {
  label: string
  className: string
} {
  if (session.transport === 'checkpoint_api' && session.source === 'live') {
    return {
      label: 'LIVE · checkpoint API',
      className: 'border-ok/40 bg-ok/10 text-ok',
    }
  }
  if (session.transport === 'checkpoint_api') {
    return {
      label: 'CHECKPOINT API · mock engine',
      className: 'border-mock/40 bg-mock/10 text-mock',
    }
  }
  return {
    label: 'MOCK · UI simulation',
    className: 'border-mock/40 bg-mock/10 text-mock',
  }
}

export function CalibrationFlow({
  session,
  onSessionChange,
  onStartExploring,
  onSkip,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [suggestedLabel, setSuggestedLabel] =
    useState<SuggestedDirectionLabel>('unlabeled')
  const [retakeId, setRetakeId] = useState<string | null>(null)

  const pendingCount = useMemo(
    () => session.captures.filter((c) => c.reviewStatus === 'pending').length,
    [session.captures],
  )
  const approvedCount = useMemo(
    () => session.captures.filter((c) => c.reviewStatus === 'approved').length,
    [session.captures],
  )
  const badge = transportBadge(session)

  const commit = (next: CalibrationSession) => {
    onSessionChange(next)
    persistCalibrationSession(next)
  }

  const setPhase = (phase: CalibrationPhase) => commit({ ...session, phase })

  const prepareTransport = async () => {
    setBusy(true)
    const next = await ensureCalibrationEngineSession(session)
    commit({ ...next, phase: next.phase === 'world_created' ? 'scan_prompt' : next.phase })
    setBusy(false)
  }

  const captureView = async () => {
    setBusy(true)
    let working = session
    if (working.transport !== 'checkpoint_api' || !working.engineSessionId) {
      working = await ensureCalibrationEngineSession(working)
    }
    const { session: after, capture: fresh } = await clientCaptureView(
      working,
      suggestedLabel,
    )
    let captures = [...after.captures]
    if (retakeId) {
      const idx = captures.findIndex((c) => c.id === retakeId)
      if (idx >= 0) {
        // Retake: new checkpoint evidence; prior id is replaced in the UI list only.
        // Old checkpoint remains on the server (immutable evidence).
        captures[idx] = {
          ...fresh,
          layoutIndex: captures[idx]!.layoutIndex,
        }
      } else {
        captures.push(fresh)
      }
      setRetakeId(null)
    } else {
      captures.push(fresh)
    }
    commit({
      ...after,
      captures,
      phase: 'capturing',
    })
    setBusy(false)
  }

  const setReview = async (
    id: string,
    reviewStatus: CalibrationCapture['reviewStatus'],
  ) => {
    if (reviewStatus === 'pending') return
    setBusy(true)
    const next = await persistReview(session, id, reviewStatus === 'approved')
    commit({
      ...next,
      phase: session.phase === 'capturing' ? 'review' : session.phase,
    })
    setBusy(false)
  }

  const removeCapture = (id: string) => {
    // Local list only — does not delete server evidence.
    commit({
      ...session,
      captures: session.captures.filter((c) => c.id !== id),
    })
    if (retakeId === id) setRetakeId(null)
  }

  const finishAndRestoreSeed = async () => {
    setBusy(true)
    const restoring: CalibrationSession = { ...session, phase: 'restoring_seed' }
    commit(restoring)
    const restored = await restoreOriginalSeed(restoring)
    commit({
      ...restored,
      phase: restored.seedRestoreDone ? 'complete' : 'review',
      completedAtMs: restored.seedRestoreDone ? Date.now() : null,
    })
    setBusy(false)
  }

  const skip = () => {
    const next: CalibrationSession = {
      ...session,
      phase: 'skipped',
      seedRestoreRequired: false,
      seedRestoreDone: true,
      completedAtMs: Date.now(),
    }
    commit(next)
    onSkip(next)
  }

  const cancel = () => {
    const next: CalibrationSession = {
      ...session,
      phase: 'cancelled',
      completedAtMs: Date.now(),
    }
    commit(next)
    onCancel()
  }

  const stepIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.phase === session.phase),
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-signal">
        User-guided calibration
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
        Look around, then capture
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-soft">
        Automatic fixed-angle calibration is{' '}
        <span className="font-semibold text-danger">NO-GO</span>. Capture View
        reuses <code className="text-xs">POST /world/checkpoints/save</code>.{' '}
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </p>

      <ol className="mt-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const active = s.phase === session.phase
          const past =
            stepIndex > i ||
            session.phase === 'complete' ||
            session.phase === 'skipped'
          return (
            <li
              key={s.phase}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                active
                  ? 'border-signal/50 bg-signal/10 text-signal'
                  : past
                    ? 'border-ok/30 text-ok'
                    : 'border-line text-muted'
              }`}
            >
              {i + 1}. {s.title}
            </li>
          )
        })}
      </ol>

      {session.lastError && (
        <p className="mt-4 rounded-lg border border-hazard/40 bg-hazard/10 px-3 py-2 text-xs text-hazard">
          {session.lastError} — falling back keeps MOCK labeling; never claims LIVE.
        </p>
      )}

      <div className="animate-fade-up mt-8 rounded-2xl border border-line bg-panel/90 p-5 sm:p-6">
        <PhaseBody
          session={session}
          busy={busy}
          suggestedLabel={suggestedLabel}
          retakeId={retakeId}
          pendingCount={pendingCount}
          approvedCount={approvedCount}
          onSuggestedLabel={setSuggestedLabel}
          onContinue={() => void prepareTransport()}
          onBeginScan={() => setPhase('capturing')}
          onCapture={() => void captureView()}
          onGoReview={() => setPhase('review')}
          onFinish={() => void finishAndRestoreSeed()}
          onExplore={() => onStartExploring(session)}
        />

        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={skip}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-bright"
          >
            Skip calibration
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            Cancel
          </button>
          <p className="self-center text-[11px] text-muted">
            Policy: user-guided visual · fixed-angle auto = no-go · native 1280×720
            {session.engineSessionId
              ? ` · session ${session.engineSessionId.slice(0, 10)}…`
              : ''}
            {session.restoredEpoch != null
              ? ` · restored epoch ${session.restoredEpoch}`
              : ''}
          </p>
        </div>
      </div>

      {session.captures.length > 0 && (
        <CaptureGrid
          captures={session.captures}
          retakeId={retakeId}
          busy={busy}
          onApprove={(id) => void setReview(id, 'approved')}
          onReject={(id) => void setReview(id, 'rejected')}
          onRetake={(id) => {
            const c = session.captures.find((x) => x.id === id)
            if (c) setSuggestedLabel(c.suggestedLabel)
            setRetakeId(id)
            setPhase('capturing')
          }}
          onRemove={removeCapture}
        />
      )}
    </div>
  )
}

function PhaseBody({
  session,
  busy,
  suggestedLabel,
  retakeId,
  pendingCount,
  approvedCount,
  onSuggestedLabel,
  onContinue,
  onBeginScan,
  onCapture,
  onGoReview,
  onFinish,
  onExplore,
}: {
  session: CalibrationSession
  busy: boolean
  suggestedLabel: SuggestedDirectionLabel
  retakeId: string | null
  pendingCount: number
  approvedCount: number
  onSuggestedLabel: (l: SuggestedDirectionLabel) => void
  onContinue: () => void
  onBeginScan: () => void
  onCapture: () => void
  onGoReview: () => void
  onFinish: () => void
  onExplore: () => void
}) {
  const step = STEPS.find((s) => s.phase === session.phase) ?? STEPS[0]!
  const captureLabel =
    session.transport === 'checkpoint_api'
      ? session.source === 'live'
        ? 'Capture View (LIVE)'
        : 'Capture View (checkpoint · mock engine)'
      : 'Capture View (MOCK UI)'

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-bright">{step.title}</h2>
      <p className="mt-1 text-sm text-soft">{step.body}</p>
      <p className="mt-3 line-clamp-2 text-xs text-muted">Theme: {session.worldPrompt}</p>

      {session.phase === 'world_created' && (
        <button
          type="button"
          disabled={busy}
          onClick={onContinue}
          className="mt-5 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void disabled:opacity-40"
        >
          {busy ? 'Connecting…' : 'Continue'}
        </button>
      )}

      {session.phase === 'scan_prompt' && (
        <div className="mt-5 space-y-3">
          <p className="rounded-lg border border-line bg-ink/60 px-3 py-2 text-xs text-soft">
            Look with mouse / WASD on the stream when available, then Capture View. This shell does
            not drive camera angles by degrees. Transport:{' '}
            <span className="font-semibold text-bright">{session.transport}</span>
            {session.engineIsMock === true ? ' · engine mock:true' : ''}
            {session.engineIsMock === false ? ' · engine LIVE' : ''}.
          </p>
          <button
            type="button"
            onClick={onBeginScan}
            className="rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
          >
            Enter scan surroundings
          </button>
        </div>
      )}

      {session.phase === 'capturing' && (
        <div className="mt-5 space-y-4">
          <label className="block max-w-xs text-xs text-muted">
            Optional suggested label
            <select
              className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-bright"
              value={suggestedLabel}
              onChange={(e) =>
                onSuggestedLabel(e.target.value as SuggestedDirectionLabel)
              }
            >
              {SUGGESTED_DIRECTION_LABELS.map((l) => (
                <option key={l} value={l}>
                  {DIRECTION_LABEL[l]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-muted">
              Soft tag only — not an exact measured heading
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCapture}
              className="rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void disabled:opacity-40"
            >
              {busy
                ? 'Capturing…'
                : retakeId
                  ? `Retake ${captureLabel}`
                  : captureLabel}
            </button>
            {session.captures.length > 0 && (
              <button
                type="button"
                onClick={onGoReview}
                className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-soft hover:text-bright"
              >
                Review thumbnails ({session.captures.length})
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            Provenance path: checkpoints/save → raw image + SHA-256. Never browser screenshot as
            proof. live_waypoint only when engine mock≠true.
          </p>
        </div>
      )}

      {session.phase === 'review' && (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-soft">
            Approved {approvedCount} · pending {pendingCount} · rejected{' '}
            {session.captures.filter((c) => c.reviewStatus === 'rejected').length}
          </p>
          <button
            type="button"
            disabled={busy || approvedCount < 1 || pendingCount > 0}
            onClick={onFinish}
            className="rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void disabled:opacity-40"
          >
            {busy ? 'Restoring seed…' : 'Complete & restore clean seed'}
          </button>
          {pendingCount > 0 && (
            <p className="text-[11px] text-hazard">
              Approve or reject every pending capture before completing.
            </p>
          )}
          {approvedCount < 1 && (
            <p className="text-[11px] text-muted">Approve at least one view, or Skip calibration.</p>
          )}
          <button
            type="button"
            onClick={() => onBeginScan()}
            className="block text-xs font-semibold text-signal hover:underline"
          >
            Capture more views
          </button>
        </div>
      )}

      {session.phase === 'restoring_seed' && (
        <div className="mt-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-signal" />
          </div>
          <p className="mt-2 text-xs text-muted">
            {session.transport === 'checkpoint_api'
              ? 'Calling POST /world/reset — epoch++, controls cleared, stale frames discarded.'
              : 'MOCK restore of original seed (no engine session).'}
          </p>
        </div>
      )}

      {(session.phase === 'complete' || session.phase === 'skipped') && (
        <button
          type="button"
          onClick={onExplore}
          className="mt-5 animate-breathe rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
        >
          Start Exploring
        </button>
      )}
    </div>
  )
}

function CaptureGrid({
  captures,
  retakeId,
  busy,
  onApprove,
  onReject,
  onRetake,
  onRemove,
}: {
  captures: CalibrationCapture[]
  retakeId: string | null
  busy: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRetake: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <section className="mt-8">
      <h3 className="font-display text-lg font-bold text-bright">Captured views</h3>
      <p className="mt-1 text-xs text-muted">
        Approve / reject / retake · optional labels · live_waypoint only with verified non-mock
        engine
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {captures.map((c) => (
          <article
            key={c.id}
            className={`overflow-hidden rounded-xl border bg-ink ${
              retakeId === c.id
                ? 'border-signal/60'
                : c.reviewStatus === 'approved'
                  ? 'border-ok/50'
                  : c.reviewStatus === 'rejected'
                    ? 'border-danger/40 opacity-80'
                    : 'border-line'
            }`}
          >
            <img src={c.imageUrl} alt="" className="aspect-video w-full object-cover" />
            <div className="space-y-1.5 p-2.5 text-[11px]">
              <p className="font-semibold text-bright">
                {DIRECTION_LABEL[c.suggestedLabel]}
                <span className="ml-1 font-normal text-muted">(optional label)</span>
              </p>
              <p className={c.source === 'live_waypoint' ? 'text-ok' : 'text-mock'}>
                {c.source === 'live_waypoint' ? 'LIVE Waypoint' : 'MOCK · not live Waypoint'}
              </p>
              <p className="font-mono text-muted">
                SHA:{' '}
                {c.imageSha256
                  ? `${c.imageSha256.slice(0, 12)}…`
                  : 'n/a (MOCK UI)'}{' '}
                · {c.reviewStatus}
              </p>
              {(c.frameId != null || c.worldId || c.navigationSegmentId) && (
                <p className="font-mono text-[10px] text-muted">
                  frame {c.frameId ?? '—'} · epoch {c.epoch ?? '—'} · seg{' '}
                  {c.navigationSegmentId
                    ? `${c.navigationSegmentId.slice(0, 8)}…`
                    : '—'}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-ok/40 bg-ok/10 px-2 py-1 font-semibold text-ok disabled:opacity-40"
                  onClick={() => onApprove(c.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-danger/40 bg-danger/10 px-2 py-1 font-semibold text-danger disabled:opacity-40"
                  onClick={() => onReject(c.id)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="rounded border border-line px-2 py-1 text-soft"
                  onClick={() => onRetake(c.id)}
                >
                  Retake
                </button>
                <button
                  type="button"
                  className="rounded border border-line px-2 py-1 text-muted"
                  onClick={() => onRemove(c.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
