import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  generateScene,
  loadSavedScenes,
  persistSavedScenes,
  scenePresets,
  type GeneratedScene,
  type SceneProgress,
} from '../services/sceneGeneration'

export function CreateWorldPage() {
  const navigate = useNavigate()
  const presets = useMemo(() => scenePresets(), [])
  const [prompt, setPrompt] = useState(presets[0] ?? '')
  const [progress, setProgress] = useState<SceneProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  })
  const [current, setCurrent] = useState<GeneratedScene | null>(null)
  const [saved, setSaved] = useState<GeneratedScene[]>(() => loadSavedScenes())
  const [error, setError] = useState<string | null>(null)

  const busy = progress.stage === 'submitting' || progress.stage === 'generating'

  const onGenerate = async () => {
    setError(null)
    try {
      const scene = await generateScene(prompt, setProgress)
      setCurrent(scene)
      const next = [scene, ...saved.filter((s) => s.prompt !== scene.prompt)].slice(0, 24)
      setSaved(next)
      persistSavedScenes(next)
    } catch (err) {
      setProgress({ stage: 'error', percent: 0, message: '' })
      setError(err instanceof Error ? err.message : 'Generation failed')
    }
  }

  const startExplore = (scene: GeneratedScene) => {
    const q = new URLSearchParams()
    q.set('scene', 'facility')
    if (scene.seed) q.set('seed', scene.seed)
    q.set('prompt', scene.prompt)
    if (scene.mock) q.set('mock_seed', '1')
    navigate(`/world?${q.toString()}`)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
        World creation
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        Describe a world you want to explore
      </h1>
      <p className="mt-3 max-w-2xl text-soft">
        A text-to-image model creates the <em>initial seed image</em>. Waypoint then makes that seed
        interactive — Waypoint itself does not process your prompt.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-panel p-5">
        <label className="block text-sm">
          <span className="mb-2 block text-muted">World description</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-line bg-ink px-3 py-2 text-base outline-none focus:border-signal"
            placeholder="An abandoned futuristic city at sunset"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrompt(p)}
              className="rounded-md border border-line bg-elevated px-2.5 py-1 text-left text-xs text-soft transition hover:border-signal/40 hover:text-bright"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !prompt.trim()}
            onClick={() => void onGenerate()}
            className="rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate World'}
          </button>
          {current && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onGenerate()}
                className="rounded-md border border-line bg-elevated px-4 py-2.5 text-sm font-semibold hover:border-signal/40"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => startExplore(current)}
                className="rounded-md border border-ok/40 bg-ok/15 px-4 py-2.5 text-sm font-bold text-ok"
              >
                Start Exploring
              </button>
            </>
          )}
          <Link
            to="/world"
            className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-bright"
          >
            Skip — predefined scene
          </Link>
        </div>

        {(busy || progress.message) && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{progress.message || 'Working…'}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink">
              <div
                className="h-full bg-signal transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </div>

      {current && (
        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-sm font-bold text-soft">Seed preview</h2>
            {current.mock ? (
              <span className="rounded bg-mock/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
                Mock — not AI-generated
              </span>
            ) : (
              <span className="rounded bg-ok/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
                Text→image seed
              </span>
            )}
          </div>
          <img
            src={current.imageUrl}
            alt="Generated seed"
            className="max-h-[420px] w-full object-cover"
          />
          <p className="px-4 py-3 text-sm text-muted">{current.prompt}</p>
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-display text-2xl font-bold">Saved scenes</h2>
        <p className="mt-1 text-sm text-muted">Stored in this browser. Mock seeds stay labeled.</p>
        {saved.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No saved scenes yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCurrent(s)
                  setPrompt(s.prompt)
                }}
                className="overflow-hidden rounded-lg border border-line bg-elevated text-left transition hover:border-signal/40"
              >
                <img src={s.imageUrl} alt="" className="h-28 w-full object-cover" />
                <div className="p-3">
                  <p className="line-clamp-2 text-sm text-bright">{s.prompt}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">
                    {s.mock ? 'Mock seed' : 'API seed'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
