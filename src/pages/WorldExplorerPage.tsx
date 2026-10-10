import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  EngineConnectionBanner,
  type EngineConnectionKind,
} from '../components/world/EngineConnectionBanner'
import { WorldViewer } from '../components/world/WorldViewer'
import { WORLD_SCENES } from '../data/scenes'
import { useWorldStream } from '../hooks/useWorldStream'
import { engineOrigin } from '../services/engineConfig'
import { worldApi } from '../services/worldApi'
import type { WorldSceneId } from '../types/world'

export function WorldExplorerPage() {
  const [params] = useSearchParams()
  const initial = (params.get('scene') as WorldSceneId) || 'facility'
  const [selected, setSelected] = useState<WorldSceneId>(initial)
  const [connKind, setConnKind] = useState<EngineConnectionKind>('probing')
  const [connDetail, setConnDetail] = useState<string>('')
  const [engineName, setEngineName] = useState<string | null>(null)
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

  const refreshProbe = () => {
    setConnKind('probing')
    setConnDetail('')
    void worldApi.probe().then((p) => {
      if (!p.ok) {
        setConnKind('unavailable')
        setConnDetail(p.message ?? '')
        setEngineName(null)
        return
      }
      setEngineName(p.engine ?? null)
      if (p.mock) {
        setConnKind('mock')
        setConnDetail(p.engine ? `Engine reports: ${p.engine}` : '')
      } else {
        setConnKind('live')
        setConnDetail(p.model ? `Model ${p.model}` : '')
      }
    })
  }

  useEffect(() => {
    refreshProbe()
  }, [])

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
        engineName={stream.engineName}
        canvasRef={stream.canvasRef}
        onRequestLock={stream.requestPointerLock}
        onPause={stream.pause}
        onReset={() => void stream.reset()}
        onDisconnect={() => void stream.disconnect()}
        onReconnect={() => stream.reconnect()}
      />
    )
  }

  const canStartReal = connKind === 'live' || connKind === 'mock'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          AI World Explorer
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
          Waypoint live stream
        </h1>
        <p className="mt-2 max-w-2xl text-soft">
          Requires the local Codex Waypoint GPU inference service for genuinely generated
          interactive video. Unlike Rescue Lab, this page is not powered by static JSON.
        </p>
      </div>

      <div className="mb-6 space-y-3">
        <EngineConnectionBanner
          kind={connKind}
          detail={connDetail}
          engineName={engineName}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshProbe}
            className="rounded-md border border-line bg-elevated px-3 py-1.5 text-sm font-semibold text-bright hover:border-signal/40"
          >
            Retry connection check
          </button>
          <span className="self-center text-xs text-muted">
            Expected origin: {engineOrigin()}
          </span>
        </div>
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
          <li>WASD / arrows — move · Mouse — look (pointer lock)</li>
          <li>Space jump · Shift sprint · wheel scroll</li>
          <li>Gen FPS vs Disp FPS · latency · dropped frames</li>
          <li>Pause / Reset / Reconnect / Disconnect</li>
        </ul>
        {stream.error && (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-bright">
            {stream.error}
          </p>
        )}
        {connKind === 'unavailable' && (
          <p className="mt-4 text-sm text-danger">
            Start session is disabled until the Waypoint server responds. Rescue Lab and Agent Eval
            still work offline from <code className="text-signal">public/data/rescue/</code>.
          </p>
        )}
        <button
          type="button"
          disabled={!scene.available || !canStartReal}
          onClick={() => void stream.start(scene.id, scene.prompt, scene.seed ?? null)}
          className="mt-5 rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
        >
          {connKind === 'unavailable' ? 'Waiting for Waypoint…' : 'Start Waypoint session'}
        </button>
      </div>
    </div>
  )
}
