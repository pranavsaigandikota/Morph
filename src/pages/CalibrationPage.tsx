import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalibrationFlow } from '../components/calibration/CalibrationFlow'
import { HuggingFaceAttribution } from '../components/brand/HuggingFaceAttribution'
import {
  clearCalibrationSession,
  createMockCalibrationSession,
  loadCalibrationSession,
  persistCalibrationSession,
} from '../services/calibration/mockCalibration'
import {
  configuredMemorySource,
  evaluateMemoryCapabilities,
  fetchEngineHealth,
} from '../services/worldMemory/capabilities'
import type { CalibrationSession } from '../types/calibration'

export function CalibrationPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const prompt = params.get('prompt') || 'Untitled world'
  const style = params.get('style') || 'cinematic'
  const seed = params.get('seed')
  const genSeedRaw = params.get('gen_seed')
  const generationSeed = genSeedRaw != null ? Number(genSeedRaw) : null
  const forceMock = params.get('mock_cal') === '1'
  const [liveGate, setLiveGate] = useState<'checking' | 'live' | 'mock' | 'unavailable'>(
    'checking',
  )
  const [gateReason, setGateReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (forceMock || configuredMemorySource() !== 'live') {
        if (!cancelled) {
          setLiveGate('mock')
          setGateReason(
            forceMock
              ? 'Explicit MOCK calibration (?mock_cal=1)'
              : 'VITE_WORLD_MEMORY_SOURCE is not live',
          )
        }
        return
      }
      const health = await fetchEngineHealth()
      // Frame size checked later in Explorer once stream runs.
      const gate = evaluateMemoryCapabilities(health, null)
      if (cancelled) return
      if (gate.ok) {
        setLiveGate('live')
        setGateReason(null)
      } else if (gate.mode === 'mock') {
        setLiveGate('mock')
        setGateReason(gate.reason)
      } else {
        setLiveGate('unavailable')
        setGateReason(gate.reason)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [forceMock])

  const initial = useMemo(() => {
    const existing = loadCalibrationSession()
    if (
      existing &&
      existing.worldPrompt === prompt &&
      (existing.sceneSeed ?? null) === (seed ?? null) &&
      existing.policy?.captureMode === 'user_guided_visual'
    ) {
      return existing
    }
    const created = createMockCalibrationSession({
      worldPrompt: prompt,
      style,
      sceneSeed: seed,
      generationSeed: Number.isFinite(generationSeed) ? generationSeed : null,
    })
    persistCalibrationSession(created)
    return created
  }, [prompt, style, seed, generationSeed])

  const [session, setSession] = useState<CalibrationSession>(initial)

  const exploreQuery = (s: CalibrationSession, live = false) => {
    const q = new URLSearchParams()
    if (seed) q.set('seed', seed)
    else q.set('scene', 'facility')
    q.set('prompt', prompt)
    q.set('style', style)
    if (generationSeed != null && Number.isFinite(generationSeed)) {
      q.set('gen_seed', String(generationSeed))
    }
    q.set(
      'calibrated',
      s.phase === 'skipped' ? 'skipped' : s.phase === 'cancelled' ? 'cancelled' : '1',
    )
    if (s.seedRestoreDone) q.set('seed_restored', '1')
    if (params.get('mock_seed') === '1') q.set('mock_seed', '1')
    if (live) {
      q.set('live_calibrate', '1')
      q.set('memory', 'live')
    }
    return q
  }

  if (liveGate === 'checking') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-sm text-soft">
        Checking LIVE calibration capabilities…
      </div>
    )
  }

  if (liveGate === 'live') {
    return (
      <div className="relative min-h-[calc(100vh-3.5rem)]">
        <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-xl px-4 py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-signal">
            LIVE guided calibration
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Continue in Explorer</h1>
          <p className="mt-2 text-sm text-soft">
            Capability gate passed (Waypoint-1.5-1B · world-memory-v1.1). Calibration runs with the
            live stream: you turn with look controls, hold still, then Capture View. Soft labels
            only — no angles.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
              onClick={() =>
                navigate(`/world?${exploreQuery(session, true).toString()}`)
              }
            >
              Begin LIVE calibration
            </button>
            <button
              type="button"
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted"
              onClick={() => navigate(`/calibrate?${params.toString()}&mock_cal=1`)}
            >
              Use MOCK shell instead
            </button>
          </div>
          <p className="mt-4 text-xs text-muted">
            <Link to="/create" className="text-signal hover:underline">
              ← Back to Create
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (liveGate === 'unavailable') {
    return (
      <div className="relative min-h-[calc(100vh-3.5rem)]">
        <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-xl px-4 py-16">
          <p className="font-semibold text-hazard">Memory unavailable</p>
          <p className="mt-2 text-sm text-soft">{gateReason}</p>
          <p className="mt-2 text-xs text-muted">
            You can still run the clearly labelled MOCK calibration shell, or skip to explore.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-mock/40 bg-mock/10 px-4 py-2.5 text-sm font-semibold text-mock"
              onClick={() => {
                setLiveGate('mock')
              }}
            >
              Open MOCK calibration
            </button>
            <button
              type="button"
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted"
              onClick={() => navigate(`/world?${exploreQuery(session).toString()}`)}
            >
              Skip to explore
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
      {gateReason && (
        <p className="mx-auto max-w-4xl px-4 pt-4 text-xs text-muted sm:px-6">
          MOCK calibration · {gateReason}
        </p>
      )}
      <CalibrationFlow
        session={session}
        onSessionChange={setSession}
        onStartExploring={(s) => navigate(`/world?${exploreQuery(s).toString()}`)}
        onSkip={(s) => navigate(`/world?${exploreQuery(s).toString()}`)}
        onCancel={() => {
          clearCalibrationSession()
          navigate('/create')
        }}
      />
      <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-6">
        <HuggingFaceAttribution compact />
        <p className="mt-4 text-center text-xs text-muted">
          <Link to="/create" className="text-signal hover:underline">
            ← Back to Create
          </Link>
        </p>
      </div>
    </div>
  )
}
