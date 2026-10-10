import { useMemo, useState } from 'react'
import {
  DIRECTION_LABEL,
  type CalibrationCapture,
  type CalibrationDirection,
  type CalibrationPhase,
  type CalibrationSession,
} from '../../types/calibration'
import {
  mockCaptureDirection,
  persistCalibrationSession,
} from '../../services/calibration/mockCalibration'

interface Props {
  session: CalibrationSession
  onSessionChange: (s: CalibrationSession) => void
  onStartExploring: (session: CalibrationSession) => void
  onSkip: (session: CalibrationSession) => void
}

const STEPS: Array<{ phase: CalibrationPhase; title: string; body: string }> = [
  {
    phase: 'world_created',
    title: 'World created',
    body: 'Your seed is ready. Optional calibration helps map estimated directions before exploration.',
  },
  {
    phase: 'scan_prompt',
    title: 'Scan surroundings',
    body: 'We will capture Forward, Right, Behind, and Left as MOCK UI stills — not live Waypoint frames until Claude’s API lands.',
  },
  {
    phase: 'capturing',
    title: 'Capture views',
    body: 'Accept each direction. Eight-direction layouts are reserved in the UI model; only four are active today.',
  },
  {
    phase: 'review',
    title: 'Review captures',
    body: 'Confirm thumbnails. These are labeled MOCK simulations for frontend development.',
  },
  {
    phase: 'complete',
    title: 'Calibration complete',
    body: 'Estimated bearings are for the session map sketch only — not physical positioning.',
  },
]

export function CalibrationFlow({
  session,
  onSessionChange,
  onStartExploring,
  onSkip,
}: Props) {
  const [busyDir, setBusyDir] = useState<CalibrationDirection | null>(null)

  const nextMissing = useMemo(() => {
    const have = new Set(session.captures.map((c) => c.direction))
    return session.plannedDirections.find((d) => !have.has(d)) ?? null
  }, [session])

  const setPhase = (phase: CalibrationPhase) => {
    const next = { ...session, phase }
    onSessionChange(next)
    persistCalibrationSession(next)
  }

  const captureOne = async (direction: CalibrationDirection) => {
    setBusyDir(direction)
    await new Promise((r) => setTimeout(r, 450))
    const cap = mockCaptureDirection(session, direction)
    const captures = [
      ...session.captures.filter((c) => c.direction !== direction),
      cap,
    ]
    const done = session.plannedDirections.every((d) =>
      captures.some((c) => c.direction === d),
    )
    const next: CalibrationSession = {
      ...session,
      captures,
      phase: done ? 'review' : 'capturing',
    }
    onSessionChange(next)
    persistCalibrationSession(next)
    setBusyDir(null)
  }

  const finish = () => {
    const next: CalibrationSession = {
      ...session,
      phase: 'complete',
      completedAtMs: Date.now(),
    }
    onSessionChange(next)
    persistCalibrationSession(next)
  }

  const skip = () => {
    const next: CalibrationSession = {
      ...session,
      phase: 'skipped',
      completedAtMs: Date.now(),
    }
    onSessionChange(next)
    persistCalibrationSession(next)
    onSkip(next)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-signal">
        Guided calibration
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
        Orient before you explore
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-soft">
        Optional first-person setup. All stills below are{' '}
        <span className="font-semibold text-mock">MOCK UI simulations</span> — not live Waypoint
        screenshots. Camera turning and calibration APIs are not implemented yet.
      </p>

      <ol className="mt-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const active = s.phase === session.phase
          const past =
            STEPS.findIndex((x) => x.phase === session.phase) > i ||
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

      <div className="animate-fade-up mt-8 rounded-2xl border border-line bg-panel/90 p-5 sm:p-6">
        <PhaseBody
          session={session}
          nextMissing={nextMissing}
          busyDir={busyDir}
          onContinueWorldCreated={() => setPhase('scan_prompt')}
          onBeginScan={() => setPhase('capturing')}
          onCapture={(d) => void captureOne(d)}
          onFinishReview={finish}
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
          <p className="self-center text-[11px] text-muted">
            Source: MOCK · directions planned: {session.plannedDirections.length} (quad now; 8
            reserved)
          </p>
        </div>
      </div>

      {session.captures.length > 0 && (
        <CaptureGrid captures={session.captures} planned={session.plannedDirections} />
      )}
    </div>
  )
}

function PhaseBody({
  session,
  nextMissing,
  busyDir,
  onContinueWorldCreated,
  onBeginScan,
  onCapture,
  onFinishReview,
  onExplore,
}: {
  session: CalibrationSession
  nextMissing: CalibrationDirection | null
  busyDir: CalibrationDirection | null
  onContinueWorldCreated: () => void
  onBeginScan: () => void
  onCapture: (d: CalibrationDirection) => void
  onFinishReview: () => void
  onExplore: () => void
}) {
  const step = STEPS.find((s) => s.phase === session.phase) ?? STEPS[0]!

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-bright">{step.title}</h2>
      <p className="mt-1 text-sm text-soft">{step.body}</p>
      <p className="mt-3 line-clamp-2 text-xs text-muted">Theme: {session.worldPrompt}</p>

      {session.phase === 'world_created' && (
        <button
          type="button"
          onClick={onContinueWorldCreated}
          className="mt-5 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
        >
          Continue
        </button>
      )}

      {session.phase === 'scan_prompt' && (
        <button
          type="button"
          onClick={onBeginScan}
          className="mt-5 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
        >
          Begin scan (MOCK)
        </button>
      )}

      {session.phase === 'capturing' && nextMissing && (
        <div className="mt-5">
          <p className="text-sm text-soft">
            Next:{' '}
            <span className="font-semibold text-bright">{DIRECTION_LABEL[nextMissing]}</span>
          </p>
          <button
            type="button"
            disabled={!!busyDir}
            onClick={() => onCapture(nextMissing)}
            className="mt-3 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void disabled:opacity-40"
          >
            {busyDir ? `Simulating ${DIRECTION_LABEL[busyDir]}…` : `Capture ${DIRECTION_LABEL[nextMissing]} (MOCK)`}
          </button>
        </div>
      )}

      {session.phase === 'review' && (
        <button
          type="button"
          onClick={onFinishReview}
          className="mt-5 rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
        >
          Mark calibration complete
        </button>
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
  planned,
}: {
  captures: CalibrationCapture[]
  planned: CalibrationDirection[]
}) {
  return (
    <section className="mt-8">
      <h3 className="font-display text-lg font-bold text-bright">Captured views</h3>
      <p className="mt-1 text-xs text-muted">
        MOCK UI stills · estimated yaw for map sketch only
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {planned.map((d) => {
          const c = captures.find((x) => x.direction === d)
          return (
            <article
              key={d}
              className="overflow-hidden rounded-xl border border-line bg-ink"
            >
              {c ? (
                <img src={c.imageUrl} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="grid aspect-video place-items-center text-xs text-muted">
                  Pending
                </div>
              )}
              <div className="space-y-0.5 p-2.5 text-[11px]">
                <p className="font-semibold text-bright">{DIRECTION_LABEL[d]}</p>
                {c ? (
                  <>
                    <p className="text-mock">MOCK · not live Waypoint</p>
                    <p className="font-mono text-muted">
                      yaw≈{c.yawDeg}° · conf{' '}
                      {c.confidence == null ? 'n/a' : c.confidence.toFixed(2)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted">Awaiting capture</p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
