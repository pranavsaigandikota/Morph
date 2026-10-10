import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  WORLD_STYLES,
  generateScene,
  loadSavedScenes,
  persistSavedScenes,
  randomWorldIdea,
  scenePresets,
  type GeneratedScene,
  type SceneProgress,
  type WorldStyle,
} from '../services/sceneGeneration'

export function CreateWorldPage() {
  const navigate = useNavigate()
  const presets = useMemo(() => scenePresets(), [])
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<WorldStyle>('cinematic')
  const [progress, setProgress] = useState<SceneProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  })
  const [current, setCurrent] = useState<GeneratedScene | null>(null)
  const [saved, setSaved] = useState<GeneratedScene[]>(() => loadSavedScenes())
  const [error, setError] = useState<string | null>(null)

  const busy = progress.stage === 'submitting' || progress.stage === 'generating'

  const commitScene = (scene: GeneratedScene) => {
    setCurrent(scene)
    const next = [scene, ...saved.filter((s) => s.id !== scene.id)].slice(0, 24)
    setSaved(next)
    persistSavedScenes(next)
  }

  const onGenerate = async (mode: 'live' | 'mock') => {
    setError(null)
    try {
      const scene = await generateScene(prompt, { style, mode, onProgress: setProgress })
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

  const startExplore = (scene: GeneratedScene) => {
    const q = new URLSearchParams()
    q.set('scene', 'facility')
    if (scene.seed) q.set('seed', scene.seed)
    q.set('prompt', scene.prompt)
    q.set('style', scene.style)
    if (scene.mock) q.set('mock_seed', '1')
    navigate(`/world?${q.toString()}`)
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

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() => void onGenerate('live')}
                className="animate-breathe rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
              >
                {busy ? 'Generating…' : 'Generate World'}
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
                    Start Exploring
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
                  mock preview.
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
                Creative presets
              </p>
              <div className="mt-3 grid gap-2">
                {presets.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => {
                      setPrompt(p.prompt)
                      setStyle(p.style)
                    }}
                    className="rounded-xl border border-line bg-elevated/50 px-3 py-2.5 text-left transition hover:border-signal/40"
                  >
                    <span className="block text-sm font-bold text-bright">{p.title}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted">{p.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {current && (
          <div className="animate-fade-up mt-8 overflow-hidden rounded-2xl border border-line bg-panel/90">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-display text-sm font-bold text-soft">Seed preview</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                  {current.style}
                </span>
                {current.mock ? (
                  <span className="rounded bg-mock/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
                    Mock — not AI-generated
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
                seed: {current.seed ?? '—'} · {current.source ?? 'unknown'}
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
