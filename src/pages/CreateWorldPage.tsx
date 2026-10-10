import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { StarterContactSheet } from '../components/create/StarterContactSheet'
import { CODEX_PRESETS, type CodexPreset } from '../data/codexPresets'
import {
  candidateToGeneratedScene,
  composeFirstPersonExplorePrompt,
  generateHqContactSheet,
  loadHqCandidates,
  persistApprovedStarter,
  persistHqCandidates,
  type HqStarterCandidate,
  type StarterApproval,
} from '../services/hqStarterCandidates'
import {
  WORLD_STYLES,
  generateScene,
  loadSavedScenes,
  persistSavedScenes,
  randomWorldIdea,
  type GeneratedScene,
  type SceneProgress,
  type WorldStyle,
} from '../services/sceneGeneration'

function asWorldStyle(style: string): WorldStyle {
  return WORLD_STYLES.some((s) => s.id === style) ? (style as WorldStyle) : 'cinematic'
}

export function CreateWorldPage() {
  const navigate = useNavigate()
  const presets = useMemo(() => CODEX_PRESETS, [])
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<WorldStyle>('cinematic')
  const [generationSeed, setGenerationSeed] = useState<string>('')
  const [progress, setProgress] = useState<SceneProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  })
  const [current, setCurrent] = useState<GeneratedScene | null>(null)
  const [saved, setSaved] = useState<GeneratedScene[]>(() => loadSavedScenes())
  const [error, setError] = useState<string | null>(null)
  const [hqCandidates, setHqCandidates] = useState<HqStarterCandidate[]>(() => loadHqCandidates())
  const [hqErrors, setHqErrors] = useState<Array<{ seed: number; message: string }>>([])
  const [hqStatus, setHqStatus] = useState(
    'Generate several deterministic HQ seeds, approve one semantically coherent starter, then enter Waypoint.',
  )

  const busy = progress.stage === 'submitting' || progress.stage === 'generating'

  const commitScene = (scene: GeneratedScene) => {
    setCurrent(scene)
    const next = [scene, ...saved.filter((s) => s.id !== scene.id)].slice(0, 24)
    setSaved(next)
    persistSavedScenes(next)
  }

  const parsedSeed = (): number | null => {
    const t = generationSeed.trim()
    if (!t) return null
    const n = Number(t)
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) return null
    return n
  }

  const onGenerate = async (mode: 'live' | 'mock') => {
    setError(null)
    const seed = parsedSeed()
    if (generationSeed.trim() && seed === null) {
      setError('Optional seed must be an integer from 0 to 4294967295')
      return
    }
    try {
      const scene = await generateScene(prompt, {
        style,
        seed,
        mode,
        onProgress: setProgress,
      })
      commitScene(scene)
    } catch (err) {
      setProgress({ stage: 'error', percent: 0, message: '' })
      setError(
        err instanceof Error
          ? err.message
          : 'Generation failed — start Codex SDXL or use Mock preview',
      )
    }
  }

  const applyPreset = (p: CodexPreset) => {
    setPrompt(p.prompt)
    setStyle(asWorldStyle(p.style))
    setGenerationSeed(String(p.generationSeed))
    setError(null)
    setProgress({ stage: 'ready', percent: 100, message: 'Preset preview (local PNG)' })
    commitScene({
      id: p.sceneId,
      prompt: p.prompt,
      style: asWorldStyle(p.style),
      imageUrl: p.localImageUrl,
      seed: p.sceneId,
      mock: false,
      createdAt: new Date().toISOString(),
      source: 'codex-preset',
      generationSeed: p.generationSeed,
    })
  }

  const onGenerateHqSheet = async () => {
    setError(null)
    if (!prompt.trim()) {
      setError('Enter the scene prompt/theme first')
      return
    }
    setHqStatus('Requesting experimental HQ SDXL candidates…')
    try {
      const batch = await generateHqContactSheet(prompt, {
        style,
        onProgress: setProgress,
      })
      setHqCandidates(batch.candidates)
      persistHqCandidates(batch.candidates)
      setHqErrors(batch.errors)
      setHqStatus(batch.message)
      if (!batch.hqApiAvailable && batch.candidates.length === 0) {
        setError(
          'HQ API unavailable here. Use Windows Codex experimental HIGH path (see docs/world-memory/HQ_STARTER_APPROVAL.md). Verified Turbo ≤4 steps will not be relabeled as HQ.',
        )
      }
    } catch (err) {
      setProgress({ stage: 'error', percent: 0, message: '' })
      setError(err instanceof Error ? err.message : 'HQ batch failed')
    }
  }

  const startExplore = (scene: GeneratedScene, opts?: { skipCalibration?: boolean }) => {
    const q = new URLSearchParams()
    // Saved Codex scene IDs explore via /world/start scene_id (after Import-DemoPresets on Windows).
    if (scene.seed && !scene.mock) q.set('seed', scene.seed)
    else q.set('scene', 'facility')
    q.set('prompt', scene.prompt)
    q.set('style', scene.style)
    if (scene.mock) q.set('mock_seed', '1')
    if (scene.generationSeed != null) q.set('gen_seed', String(scene.generationSeed))
    if (scene.source) q.set('source', scene.source)
    // Optional guided calibration shell (MOCK) before Explorer — skippable.
    if (opts?.skipCalibration) {
      navigate(`/world?${q.toString()}`)
    } else {
      navigate(`/calibrate?${q.toString()}`)
    }
  }

  const onHqApproval = (id: string, approval: StarterApproval) => {
    const next = hqCandidates.map((c) => {
      if (approval === 'approved') {
        if (c.id === id) return { ...c, approval: 'approved' as const }
        // Only one approved starter at a time for Enter World.
        if (c.approval === 'approved') return { ...c, approval: 'pending' as const }
        return c
      }
      return c.id === id ? { ...c, approval } : c
    })
    setHqCandidates(next)
    persistHqCandidates(next)
    const approved = next.find((c) => c.id === id && approval === 'approved')
    if (approved) {
      persistApprovedStarter(approved)
      commitScene(candidateToGeneratedScene(approved))
      setHqStatus(
        `Approved seed ${approved.generationSeed}` +
          (approved.imageSha256 ? ` · SHA-256 ${approved.imageSha256.slice(0, 16)}…` : '') +
          ' — safe to enter Waypoint. Preserve prompt/seed/settings for reproducibility.',
      )
    } else if (approval === 'rejected') {
      setHqStatus(
        'Candidate rejected — not a recovery anchor. Approve a semantically coherent starter first.',
      )
    }
  }

  const onExploreApproved = (c: HqStarterCandidate) => {
    if (c.approval !== 'approved') {
      setError('Approve one HQ candidate before entering Waypoint from the contact sheet.')
      return
    }
    if (c.mock || c.quality === 'turbo') {
      setError('Approved starter must be real HQ SDXL — not MOCK and not Turbo-class.')
      return
    }
    const scene = candidateToGeneratedScene(c)
    commitScene(scene)
    persistApprovedStarter(c)
    startExplore(scene)
  }

  const createAnother = () => {
    setCurrent(null)
    setProgress({ stage: 'idle', percent: 0, message: '' })
    setError(null)
    setPrompt('')
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-40 ws-grid-mask" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-signal">
          Create Anything
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
          Describe a world you want to{' '}
          <span className="ws-shimmer-text">explore</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-soft sm:text-lg">
          Freeform imagination — not limited to emergencies. SDXL builds a seed image; Waypoint makes
          it a first-person interactive world.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="ws-panel animate-fade-up rounded-2xl p-5 sm:p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
                World prompt
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-xl border border-line bg-ink/80 px-4 py-3 text-base outline-none transition focus:border-signal"
                placeholder="A floating lantern festival above a misty mountain lake…"
              />
            </label>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Style</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WORLD_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      style === s.id
                        ? 'border-signal/60 bg-signal/10 text-bright'
                        : 'border-line bg-elevated/60 text-soft hover:border-signal/30'
                    }`}
                  >
                    <span className="block text-sm font-bold">{s.label}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
                Optional generation seed
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={generationSeed}
                onChange={(e) => setGenerationSeed(e.target.value)}
                placeholder="Leave blank for random · 0…4294967295"
                className="w-full rounded-xl border border-line bg-ink/80 px-4 py-2.5 font-mono text-sm outline-none focus:border-signal"
              />
            </label>

            <p className="mt-4 rounded-xl border border-line bg-ink/50 px-3 py-2.5 text-xs text-muted">
              Composition guide (appended for HQ sheet only):{' '}
              <span className="text-soft">
                {composeFirstPersonExplorePrompt(prompt || '…').slice(0, 160)}
                …
              </span>
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() => void onGenerateHqSheet()}
                className="animate-breathe rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
              >
                {busy ? 'Generating HQ…' : 'Generate HQ candidates'}
              </button>
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() => void onGenerate('live')}
                className="rounded-xl border border-line bg-elevated px-4 py-2.5 text-sm font-semibold hover:border-signal/40 disabled:opacity-40"
              >
                Turbo generate (verified ≤4 steps)
              </button>
              <button
                type="button"
                onClick={() => setPrompt(randomWorldIdea())}
                className="rounded-xl border border-line bg-elevated px-4 py-2.5 text-sm font-semibold hover:border-signal/40"
              >
                Surprise me
              </button>
              {current && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onGenerate(current.mock ? 'mock' : 'live')}
                    className="rounded-xl border border-line bg-elevated px-4 py-2.5 text-sm font-semibold"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => startExplore(current)}
                    className="rounded-xl border border-ok/40 bg-ok/15 px-4 py-2.5 text-sm font-bold text-ok"
                  >
                    Calibrate & Explore
                  </button>
                  <button
                    type="button"
                    onClick={() => startExplore(current, { skipCalibration: true })}
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-bright"
                  >
                    Skip to Explore
                  </button>
                  <button
                    type="button"
                    onClick={createAnother}
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-bright"
                  >
                    Create Another World
                  </button>
                </>
              )}
            </div>

            {(busy || progress.message) && (
              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>{progress.message || 'Working…'}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full bg-gradient-to-r from-signal to-aurora transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
                <p className="font-semibold text-bright">Generation failed</p>
                <p className="mt-1 text-soft">{error}</p>
                <p className="mt-2 text-xs text-muted">
                  This is not MOCK mode. Start Codex SDXL on :8000, or explicitly render a labeled
                  mock preview. MOCK images are never HQ approval candidates.
                </p>
                <button
                  type="button"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void onGenerate('mock')}
                  className="mt-3 rounded-lg border border-mock/50 bg-mock/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-mock"
                >
                  Use MOCK preview
                </button>
              </div>
            )}
          </div>

          <div className="animate-fade-up space-y-4" style={{ animationDelay: '80ms' }}>
            <div className="ws-panel rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Six real SDXL presets
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Local PNG previews. Explore uses saved scene IDs after Windows{' '}
                <code className="text-signal">Import-DemoPresets.ps1</code>.
              </p>
              <div className="mt-3 grid gap-2">
                {presets.map((p) => (
                  <button
                    key={p.presetName}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex gap-3 rounded-xl border border-line bg-elevated/50 p-2 text-left transition hover:border-signal/40"
                  >
                    <img
                      src={p.localImageUrl}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-bright">{p.title}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted">{p.prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <StarterContactSheet
          candidates={hqCandidates}
          errors={hqErrors}
          statusMessage={hqStatus}
          onApproval={onHqApproval}
          onExploreApproved={onExploreApproved}
        />

        {current && (
          <div className="animate-fade-up mt-8 overflow-hidden rounded-2xl border border-line bg-panel/90">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-display text-sm font-bold text-soft">
                {current.source === 'sdxl-hq' ? 'Approved HQ starter' : 'Seed preview'}
              </h2>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                  {current.style}
                </span>
                {current.mock ? (
                  <span className="rounded bg-mock/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
                    Mock — not AI-generated
                  </span>
                ) : current.source === 'sdxl-hq' ? (
                  <span className="rounded bg-ok/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
                    Approved HQ SDXL
                  </span>
                ) : (
                  <span className="rounded bg-ok/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
                    LIVE SDXL seed
                  </span>
                )}
              </div>
            </div>
            {current.imageUrl ? (
              <img
                src={current.imageUrl}
                alt="Generated world seed"
                className="max-h-[460px] w-full object-cover"
              />
            ) : (
              <div className="grid h-48 place-items-center text-sm text-muted">
                Seed token ready — preview image not returned by API
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="max-w-3xl text-sm text-muted">{current.prompt}</p>
              <p className="font-mono text-[11px] text-muted">
                seed: {current.seed ?? '—'} · gen:{current.generationSeed ?? '—'} ·{' '}
                {current.source ?? 'unknown'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Saved worlds</h2>
              <p className="mt-1 text-sm text-muted">
                Browser gallery from returned seed metadata. Mock stays labeled.
              </p>
            </div>
            <Link to="/world" className="text-sm font-semibold text-signal hover:underline">
              Open Explorer →
            </Link>
          </div>
          {saved.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No saved worlds yet — generate your first.</p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setCurrent(s)
                    setPrompt(s.prompt)
                    setStyle(s.style)
                  }}
                  className="group overflow-hidden rounded-2xl border border-line bg-elevated/70 text-left transition hover:border-signal/45"
                >
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-32 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="grid h-32 place-items-center bg-ink text-xs text-muted">No preview</div>
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm text-bright">{s.prompt}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">
                      {s.style} · {s.mock ? 'Mock seed' : 'SDXL seed'}
                      {s.seed ? ` · ${s.seed}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
