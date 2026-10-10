import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WorldViewer } from '../components/world/WorldViewer'
import { WORLD_SCENES } from '../data/scenes'
import { useWorldStream } from '../hooks/useWorldStream'
import type { WorldSceneId } from '../types/world'

export function WorldExplorerPage() {
  const [params] = useSearchParams()
  const initial = (params.get('scene') as WorldSceneId) || 'facility'
  const [selected, setSelected] = useState<WorldSceneId>(initial)
  const stream = useWorldStream()

  const scene = useMemo(
    () => WORLD_SCENES.find((s) => s.id === selected) ?? WORLD_SCENES[0]!,
    [selected],
  )

  const active =
    stream.phase === 'streaming' ||
    stream.phase === 'paused' ||
    stream.phase === 'connecting' ||
    stream.phase === 'starting' ||
    stream.phase === 'reconnecting'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.pointerLockElement) {
        document.exitPointerLock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (active || stream.frameUrl) {
    return (
      <WorldViewer
        frameUrl={stream.frameUrl}
        meta={stream.meta}
        metrics={stream.metrics}
        phase={stream.phase}
        mock={stream.mock}
        error={stream.error}
        pointerLocked={stream.pointerLocked}
        canvasRef={stream.canvasRef}
        onRequestLock={stream.requestPointerLock}
        onPause={stream.pause}
        onReset={() => void stream.reset()}
        onDisconnect={() => void stream.disconnect()}
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">AI World Explorer</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">Choose a world scene</h1>
        <p className="mt-2 max-w-2xl text-soft">
          Frames are streamed from the mock world engine over WebSocket. Geometry in the video is
          not treated as reliable physical truth — use the Rescue Lab for deterministic maps.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {WORLD_SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.available}
            onClick={() => setSelected(s.id)}
            className={`rounded-xl border p-4 text-left transition ${
              selected === s.id
                ? 'border-signal bg-elevated'
                : s.available
                  ? 'border-line bg-panel hover:border-signal/40'
                  : 'cursor-not-allowed border-line bg-panel/40 opacity-60'
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-muted">{s.id}</p>
            <h2 className="mt-1 font-display text-lg font-bold">{s.title}</h2>
            <p className="mt-2 text-sm text-muted">{s.subtitle}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-line bg-panel p-5">
        <h3 className="font-display text-xl font-bold">{scene.title}</h3>
        <p className="mt-1 text-sm text-soft">{scene.prompt}</p>
        <ul className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>WASD — move · Mouse — look (pointer lock)</li>
          <li>Pause / Reset / Disconnect in the stream bar</li>
          <li>Telemetry: gen FPS, disp FPS, latency, drops, GPU</li>
          <li>
            <span className="text-mock">MOCK</span> badge while using the local mock server
          </li>
        </ul>
        {stream.error && (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-bright">
            {stream.error}
          </p>
        )}
        <button
          type="button"
          disabled={!scene.available}
          onClick={() => void stream.start(scene.id, scene.prompt)}
          className="mt-5 rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
        >
          Start session
        </button>
      </div>
    </div>
  )
}
