import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapLegend } from '../components/simulation/MapLegend'
import { RescueScene } from '../components/simulation/RescueScene'
import {
  rescueEnvAdapter,
  rescueEnvSourceLabel,
  type RescueMissionState,
  type RescueMove,
} from '../services/rescueEnvAdapter'
import { loadRescuePackage } from '../services/rescueStatic'
import type { BuildingMap } from '../types/simulation'

const SCENARIOS = [
  {
    id: 'facility_a',
    title: 'Facility A — Sublevel 2',
    blurb: 'Reach any exit. Walls block. Hazards register hits.',
  },
]

function DPad({
  disabled,
  onMove,
}: {
  disabled: boolean
  onMove: (m: RescueMove) => void
}) {
  const btn =
    'grid h-11 w-11 place-items-center rounded-xl border border-line bg-elevated text-sm font-bold text-bright transition hover:border-signal/50 disabled:opacity-35'
  return (
    <div className="grid grid-cols-3 gap-1.5 place-items-center" aria-label="On-screen movement">
      <span />
      <button type="button" className={btn} disabled={disabled} onClick={() => onMove('N')}>
        ↑
      </button>
      <span />
      <button type="button" className={btn} disabled={disabled} onClick={() => onMove('W')}>
        ←
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => onMove('S')}>
        ↓
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => onMove('E')}>
        →
      </button>
    </div>
  )
}

export function RescueMissionPage() {
  const [map, setMap] = useState<BuildingMap | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mission, setMission] = useState<RescueMissionState | null>(null)
  const [showAstar, setShowAstar] = useState(false)
  const [scenarioId, setScenarioId] = useState('facility_a')

  useEffect(() => {
    let cancelled = false
    void loadRescuePackage()
      .then((pkg) => {
        if (cancelled) return
        const m = pkg.maps[scenarioId] ?? Object.values(pkg.maps)[0]
        if (!m) {
          setLoadError('No map in public/data/rescue/')
          return
        }
        setMap(m)
        setMission(rescueEnvAdapter.create(m))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load map')
      })
    return () => {
      cancelled = true
    }
  }, [scenarioId])

  const astar = useMemo(
    () => (map ? rescueEnvAdapter.shortestExitPath(map) : []),
    [map],
  )

  const applyMove = (move: RescueMove) => {
    setMission((m) => {
      if (!m || m.status === 'success' || m.status === 'failed') return m
      return rescueEnvAdapter.step(m, move)
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const move = rescueEnvAdapter.keyToMove(e.code)
      if (!move) return
      e.preventDefault()
      applyMove(move)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const restart = () => {
    if (map) {
      setMission(rescueEnvAdapter.create(map))
      setShowAstar(false)
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-danger">{loadError}</p>
        <p className="mt-2 text-sm text-muted">
          Rescue Missions use static JSON from public/data/rescue/ — no GPU required.
        </p>
      </div>
    )
  }

  if (!map || !mission) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-soft">Loading facility map…</div>
    )
  }

  const ended = mission.status === 'success' || mission.status === 'failed'
  const playDisabled = ended

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-80" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-hazard">
              Interactive Rescue
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">
              Pilot the rescue robot
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-soft">
              Playable grid mission on the verified facility map. This is <strong>not</strong>{' '}
              Waypoint video — robots do not navigate generated worlds.
            </p>
            <p className="mt-1 text-xs text-muted">{rescueEnvSourceLabel()}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/agents"
              className="rounded-xl border border-aurora/40 bg-panel px-4 py-2 text-sm font-semibold text-aurora hover:border-aurora/70"
            >
              AI Showdown →
            </Link>
            <Link
              to="/simulation"
              className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold text-signal hover:border-signal/40"
            >
              Recorded replays →
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenarioId(s.id)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                scenarioId === s.id
                  ? 'border-hazard/50 bg-hazard/15 text-hazard'
                  : 'border-line bg-elevated text-soft'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {ended && (
          <div
            className={`animate-fade-up mt-5 rounded-2xl border px-4 py-3 text-sm ${
              mission.status === 'success'
                ? 'border-ok/40 bg-ok/10 text-ok'
                : 'border-danger/40 bg-danger/10 text-danger'
            }`}
          >
            <p className="font-display text-lg font-bold">
              {mission.status === 'success' ? 'Mission complete' : 'Mission failed'}
            </p>
            <p className="mt-1 text-bright/90">{mission.message}</p>
            <p className="mt-1 text-xs text-muted">
              Steps {mission.step} · collisions {mission.collisions} · hazard hits{' '}
              {mission.hazardHits}
              {showAstar
                ? ` · A* optimum ${astar.length ? astar.length - 1 : '—'} steps`
                : ' · compare with A* below'}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="relative h-[min(70vh,640px)] min-h-[360px]">
            <RescueScene
              map={map}
              agent={mission.agent}
              path={mission.path}
              comparePath={showAstar ? astar : undefined}
              interactiveCamera
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line/80 bg-ink/75 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-soft backdrop-blur">
              <span className="mr-3 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-signal" /> Your path
              </span>
              {showAstar && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-hazard" /> A*
                </span>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="ws-panel rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">HUD</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Status</dt>
                  <dd
                    className={
                      mission.status === 'success'
                        ? 'font-bold text-ok'
                        : mission.status === 'failed'
                          ? 'font-bold text-danger'
                          : 'font-semibold text-bright'
                    }
                  >
                    {mission.status}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Steps</dt>
                  <dd className="font-mono">
                    {mission.step} / {mission.maxSteps}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Collisions</dt>
                  <dd className="font-mono">{mission.collisions}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Hazard hits</dt>
                  <dd className="font-mono">{mission.hazardHits}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-soft">{mission.message}</p>
            </div>

            <div className="ws-panel rounded-2xl p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Move
              </p>
              <DPad disabled={playDisabled} onMove={applyMove} />
              <p className="mt-3 text-[11px] text-muted">
                Also <kbd className="text-signal">WASD</kbd> / arrows · drag orbit on the map
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={restart}
                className="rounded-xl bg-signal px-4 py-2.5 text-sm font-bold text-void"
              >
                Restart mission
              </button>
              <button
                type="button"
                disabled={!ended}
                onClick={() => setShowAstar(true)}
                className="rounded-xl border border-hazard/40 bg-hazard/10 px-4 py-2.5 text-sm font-bold text-hazard disabled:opacity-40"
              >
                Compare my route vs A*
              </button>
              {showAstar && (
                <p className="text-xs text-muted">
                  Teal = your path · Amber = shortest A* (
                  {astar.length ? astar.length - 1 : '—'} steps). You used {mission.step} steps.
                </p>
              )}
            </div>

            <MapLegend />
          </aside>
        </div>
      </div>
    </div>
  )
}
