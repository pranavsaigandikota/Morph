import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  EngineConnectionBanner,
  type EngineConnectionKind,
} from '../components/world/EngineConnectionBanner'
import { WorldViewer } from '../components/world/WorldViewer'
import { WORLD_SCENES } from '../data/scenes'
import { useWorldStream } from '../hooks/useWorldStream'
import { worldApiBaseUrl } from '../services/engineConfig'
import { loadSavedScenes } from '../services/sceneGeneration'
import { worldApi } from '../services/worldApi'
import type { WorldSceneId } from '../types/world'
import type { SwitchableWorld } from '../components/world/WorldViewer'

export function WorldExplorerPage() {
  const [params] = useSearchParams()
  const initial = (params.get('scene') as WorldSceneId) || 'facility'
  const seedFromCreate = params.get('seed')
  const promptFromCreate = params.get('prompt')
  const [selected, setSelected] = useState<WorldSceneId>(initial)
  const [connKind, setConnKind] = useState<EngineConnectionKind>('probing')
  const [connDetail, setConnDetail] = useState<string>('')
  const [engineName, setEngineName] = useState<string | null>(null)
  const stream = useWorldStream()
  const [savedWorlds, setSavedWorlds] = useState(() => loadSavedScenes())

  const scene = useMemo(
    () => WORLD_SCENES.find((s) => s.id === selected) ?? WORLD_SCENES[0]!,
    [selected],
  )

  const switchableWorlds = useMemo((): SwitchableWorld[] => {
    const fromSaved: SwitchableWorld[] = savedWorlds
      .filter((s) => s.seed)
      .map((s) => ({
        id: s.id,
        label: s.prompt.slice(0, 48) + (s.prompt.length > 48 ? '…' : ''),
        seed: s.seed,
        mock: s.mock,
      }))
    const builtins: SwitchableWorld[] = WORLD_SCENES.filter((s) => s.available).map((s) => ({
      id: s.id,
      label: s.title,
      seed: s.seed ?? null,
      mock: false,
    }))
    // Prefer current query seed first
    const current: SwitchableWorld[] = seedFromCreate
      ? [
          {
            id: 'current',
            label: (promptFromCreate || 'Current world').slice(0, 48),
            seed: seedFromCreate,
            mock: params.get('mock_seed') === '1',
          },
        ]
      : []
    const seen = new Set<string>()
    const out: SwitchableWorld[] = []
    for (const w of [...current, ...fromSaved, ...builtins]) {
      const key = w.seed ?? w.id
      if (seen.has(key)) continue
      seen.add(key)
      out.push(w)
    }
    return out
  }, [savedWorlds, seedFromCreate, promptFromCreate, params])

  useEffect(() => {
    setSavedWorlds(loadSavedScenes())
  }, [])

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

  // Auto-start when arriving from Create World with a seed and live/mock engine
  useEffect(() => {
    if (!seedFromCreate) return
    if (connKind !== 'live' && connKind !== 'mock') return
    if (stream.phase !== 'idle' && stream.phase !== 'disconnected') return
    void stream.start(scene.id, promptFromCreate || scene.prompt, seedFromCreate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot from query
  }, [connKind, seedFromCreate])

  if (active || stream.hasFrame) {
    return (
      <WorldViewer
        hasFrame={stream.hasFrame}
        meta={stream.meta}
        metrics={stream.metrics}
        phase={stream.phase}
        mock={stream.mock}
        error={stream.error}
        pointerLocked={stream.pointerLocked}
        engineName={stream.engineName}
        stageRef={stream.stageRef}
        canvasElRef={stream.canvasElRef}
        onRequestLock={stream.requestPointerLock}
        onPause={stream.pause}
        onReset={() => void stream.reset()}
        onDisconnect={() => void stream.disconnect()}
        onReconnect={() => stream.reconnect()}
        lookRisk={stream.lookRisk}
        lookSensitivity={stream.lookSensitivity}
        onLookSensitivity={stream.setMouseSens}
        lastSentMouse={stream.lastSentMouse}
        idleHolding={stream.idleHolding}
        worlds={switchableWorlds}
        activeSeed={stream.activeSeed}
        onSwitchWorld={(seed) => void stream.switchWorld(seed)}
      />
    )
  }

  const canStart = connKind === 'live' || connKind === 'mock'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          AI World Explorer
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
          First-person Waypoint stream
        </h1>
        <p className="mt-2 max-w-2xl text-soft">
          Connects to Codex Waypoint at <code className="text-signal">{worldApiBaseUrl()}</code>{' '}
          via <code className="text-signal">WS /stream</code>. Requires the real GPU service for
          genuine interactive video.
        </p>
        <Link
          to="/create"
          className="mt-4 inline-flex text-sm font-semibold text-signal hover:underline"
        >
          Or describe a world to create a seed →
        </Link>
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
          {connKind === 'unavailable' && (
            <Link
              to="/simulation"
              className="rounded-md border border-line bg-elevated px-3 py-1.5 text-sm font-semibold text-bright hover:border-signal/40"
            >
              Open Rescue Lab (offline)
            </Link>
          )}
        </div>
        {connKind === 'unavailable' && (
          <div className="rounded-md border border-line bg-panel px-3 py-3 text-xs text-soft">
            <p className="font-semibold text-bright">Explicit mock (optional)</p>
            <p className="mt-1">
              Mock is never started automatically. To test the Phase-2 wire format without GPU,
              stop this process and run:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-void/60 px-2 py-2 font-mono text-[11px] text-signal">
              npm run dev:mock
            </pre>
          </div>
        )}
      </div>

      {promptFromCreate && (
        <p className="mb-4 rounded-md border border-line bg-panel px-3 py-2 text-sm text-soft">
          Seed from create flow: <span className="text-bright">{promptFromCreate}</span>
          {params.get('mock_seed') === '1' && (
            <span className="ml-2 text-mock">(MOCK seed — not AI-generated)</span>
          )}
        </p>
      )}

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
        {stream.error && (
          <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {stream.error}
          </p>
        )}
        {connKind === 'unavailable' && (
          <p className="mt-4 text-sm text-danger">
            Start is disabled — Waypoint at {worldApiBaseUrl()} did not respond. This is a
            connection error, not LIVE and not MOCK. Start Codex on :8000, then Retry.
          </p>
        )}
        <button
          type="button"
          disabled={!scene.available || !canStart}
          onClick={() =>
            void stream.start(scene.id, promptFromCreate || scene.prompt, seedFromCreate || scene.seed)
          }
          className="mt-5 rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
        >
          {connKind === 'unavailable'
            ? 'Waiting for Waypoint…'
            : connKind === 'mock'
              ? 'Start Exploring (MOCK)'
              : 'Start Exploring'}
        </button>
      </div>
    </div>
  )
}
