import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalibrationFlow } from '../components/calibration/CalibrationFlow'
import { HuggingFaceAttribution } from '../components/brand/HuggingFaceAttribution'
import {
  createMockCalibrationSession,
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

  const initial = useMemo(() => {
    const existing = loadCalibrationSession()
    if (
      existing &&
      existing.worldPrompt === prompt &&
      (existing.sceneSeed ?? null) === (seed ?? null)
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

  const exploreQuery = () => {
    const q = new URLSearchParams()
    if (seed) q.set('seed', seed)
    else q.set('scene', 'facility')
    q.set('prompt', prompt)
    q.set('style', style)
    if (generationSeed != null && Number.isFinite(generationSeed)) {
      q.set('gen_seed', String(generationSeed))
    }
    q.set('calibrated', session.phase === 'skipped' ? 'skipped' : '1')
    if (params.get('mock_seed') === '1') q.set('mock_seed', '1')
    return q
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
      <CalibrationFlow
        session={session}
        onSessionChange={setSession}
        onStartExploring={() => navigate(`/world?${exploreQuery().toString()}`)}
        onSkip={() => navigate(`/world?${exploreQuery().toString()}`)}
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
