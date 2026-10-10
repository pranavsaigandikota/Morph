import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalibrationFlow } from '../components/calibration/CalibrationFlow'
import { HuggingFaceAttribution } from '../components/brand/HuggingFaceAttribution'
import { createCalibrationSession } from '../services/calibration/calibrationClient'
import {
  clearCalibrationSession,
  loadCalibrationSession,
  persistCalibrationSession,
} from '../services/calibration/mockCalibration'
import type { CalibrationSession } from '../types/calibration'

export function CalibrationPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const prompt = params.get('prompt') || 'Untitled world'
  const style = params.get('style') || 'cinematic'
  const seed = params.get('seed')
  const genSeedRaw = params.get('gen_seed')
  const generationSeed = genSeedRaw != null ? Number(genSeedRaw) : null
  const engineSessionId = params.get('session_id')

  const initial = useMemo(() => {
    const existing = loadCalibrationSession()
    if (
      existing &&
      existing.worldPrompt === prompt &&
      (existing.sceneSeed ?? null) === (seed ?? null) &&
      existing.policy?.captureMode === 'user_guided_visual' &&
      (engineSessionId == null || existing.engineSessionId === engineSessionId)
    ) {
      return existing
    }
    const created = createCalibrationSession({
      worldPrompt: prompt,
      style,
      sceneSeed: seed,
      generationSeed: Number.isFinite(generationSeed) ? generationSeed : null,
      engineSessionId,
    })
    persistCalibrationSession(created)
    return created
  }, [prompt, style, seed, generationSeed, engineSessionId])

  const [session, setSession] = useState<CalibrationSession>(initial)

  const exploreQuery = (s: CalibrationSession) => {
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
    if (s.transport === 'checkpoint_api') q.set('cal_transport', 'checkpoint_api')
    if (s.source === 'live') q.set('cal_source', 'live')
    else q.set('cal_source', 'mock')
    if (s.restoredEpoch != null) q.set('restored_epoch', String(s.restoredEpoch))
    // Explorer starts its own stream; pass session only as provenance hint.
    if (s.engineSessionId) q.set('cal_session_id', s.engineSessionId)
    if (params.get('mock_seed') === '1') q.set('mock_seed', '1')
    return q
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
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
