import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapLegend } from '../components/simulation/MapLegend'
import { RescueScene } from '../components/simulation/RescueScene'
import {
  RescueGame,
  createStepController,
  type ActionName,
  type AStarComparison,
  type ControlEvent,
  type ScenarioDict,
  type ScoreResult,
  type SimState,
  type StepController,
} from '../lib/rescue-play'
import {
  agentPoseFromSim,
  astarPathFromComparison,
  buildingMapFromSim,
  playerPathFromState,
} from '../services/rescuePlayBridge'

interface ManifestMission {
  id: string
  title: string
  difficulty: string
  map_size: string
  par: number
  max_steps: number
  seed: number
  mission: string
  astar_route: string
}

interface Manifest {
  missions: ManifestMission[]
  disclaimer?: string
}

const MANIFEST_URL = '/data/rescue-play/manifest.json'

function DPad({
  disabled,
  onPress,
}: {
  disabled: boolean
  onPress: (a: ActionName) => void
}) {
  const btn =
    'grid h-11 w-11 place-items-center rounded-xl border border-line bg-elevated text-sm font-bold text-bright transition hover:border-signal/50 disabled:opacity-35'
  return (
    <div className="grid grid-cols-3 gap-1.5 place-items-center" aria-label="On-screen movement">
      <span />
      <button type="button" className={btn} disabled={disabled} onClick={() => onPress('up')}>
        ↑
      </button>
      <span />
      <button type="button" className={btn} disabled={disabled} onClick={() => onPress('left')}>
        ←
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => onPress('down')}>
        ↓
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => onPress('right')}>
        →
      </button>
    </div>
  )
}

function starsLabel(stars: number): string {
  if (stars <= 0) return '☆☆☆'
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))
}

export function RescueMissionPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [missionJson, setMissionJson] = useState<ScenarioDict | null>(null)
  const [briefing, setBriefing] = useState('')
  const [state, setState] = useState<SimState | null>(null)
  const [score, setScore] = useState<ScoreResult | null>(null)
  const [comparison, setComparison] = useState<AStarComparison | null>(null)
  const [showAstar, setShowAstar] = useState(false)
  const [collisionFlash, setCollisionFlash] = useState(false)
  const [boardFocused, setBoardFocused] = useState(false)
  const [, bump] = useState(0)

  const gameRef = useRef<RescueGame | null>(null)
  const ctlRef = useRef<StepController | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const armedRef = useRef(false)

  const refreshFromCtl = useCallback((s: SimState, ev?: ControlEvent) => {
    const g = gameRef.current
    const ctl = ctlRef.current
    if (!g || !ctl) return
    setState(s)
    setScore(g.score())
    setComparison(g.compareWithAStar())
    setShowAstar(ctl.showAStar)
    setCollisionFlash(ctl.collisionFlash)
    if (ev?.type === 'restart') {
      setShowAstar(false)
      setCollisionFlash(false)
    }
    bump((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetch(MANIFEST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${MANIFEST_URL}`)
        return r.json() as Promise<Manifest>
      })
      .then((m) => {
        if (cancelled) return
        setManifest(m)
        setMissionId(m.missions[0]?.id ?? null)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Manifest load failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!manifest || !missionId) return
    let cancelled = false
    const entry = manifest.missions.find((m) => m.id === missionId)
    if (!entry) return

    void (async () => {
      try {
        const url = new URL(entry.mission, window.location.origin + MANIFEST_URL)
        const data = await (await fetch(url)).json()
        if (cancelled) return
        setMissionJson(data as ScenarioDict)
        const missionMeta = (data as ScenarioDict & { mission?: { briefing?: string; objective?: string } })
          .mission
        setBriefing(
          [missionMeta?.briefing, missionMeta?.objective].filter(Boolean).join(' ') || entry.title,
        )
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Mission load failed')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [manifest, missionId])

  // Authoritative controller — all movement/restart/undo goes through createStepController.
  useEffect(() => {
    if (!missionJson) return

    const game = new RescueGame(missionJson)
    gameRef.current = game

    const ctl = createStepController(game, {
      holdRepeatMs: 200,
      collisionFlashMs: 350,
      // Active on the mission page unless a form field has focus (t17u / CURSOR_HANDOFF).
      // Do not gate on board DOM focus — the WebGL canvas steals focus after clicks.
      isActive: () => {
        const t = document.activeElement
        if (
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement
        ) {
          return false
        }
        return true
      },
      onChange: (s, ev) => refreshFromCtl(s, ev),
    })
    ctlRef.current = ctl
    armedRef.current = true
    refreshFromCtl(game.getState())

    requestAnimationFrame(() => {
      boardRef.current?.focus({ preventScroll: true })
      setBoardFocused(true)
    })

    const onKeyDown = (e: KeyboardEvent) => {
      ctl.handleKeyDown(e)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      ctl.handleKeyUp(e)
    }
    const onBlur = () => ctl.handleBlur()
    const onVis = () => {
      if (document.visibilityState === 'hidden') ctl.handleVisibilityHidden()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVis)
      ctl.dispose()
      ctlRef.current = null
      gameRef.current = null
    }
  }, [missionJson, refreshFromCtl])

  const focusBoard = useCallback(() => {
    const el = boardRef.current
    if (!el) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    armedRef.current = true
    setBoardFocused(true)
  }, [])

  const map = useMemo(() => {
    if (!state || !missionId) return null
    const title = manifest?.missions.find((m) => m.id === missionId)?.title ?? missionId
    return buildingMapFromSim(state, missionId, title)
  }, [state, missionId, manifest])

  const agent = useMemo(() => (state ? agentPoseFromSim(state) : null), [state])
  const path = useMemo(() => (state ? playerPathFromState(state) : []), [state])
  const astarPath = useMemo(
    () => (showAstar ? astarPathFromComparison(comparison) : undefined),
    [showAstar, comparison],
  )

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-danger">{loadError}</p>
        <p className="mt-2 text-sm text-muted">
          Rescue Missions use RescueGame + createStepController from public/data/rescue-play/.
        </p>
      </div>
    )
  }

  if (!manifest || !state || !map || !agent || !missionId || !ctlRef.current) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-soft">Loading Rescue Play…</div>
    )
  }

  const ctl = ctlRef.current
  const game = gameRef.current!
  const ended = state.done
  const playDisabled = !ctl.canMove
  const metrics = game.metrics()
  const entry = manifest.missions.find((m) => m.id === missionId)
  const undoDisabled = ended || !(state.trajectory?.length)

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
              Authoritative <strong className="text-bright">RescueGame</strong> +{' '}
              <strong className="text-bright">createStepController</strong> (t17u). Not Waypoint
              video.
            </p>
            <p className="mt-1 text-xs text-muted">
              Tap = 1 cell · hold = 200 ms repeat · wall hold stops after one collision
            </p>
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
          {manifest.missions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setMissionId(s.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                missionId === s.id
                  ? 'border-hazard/50 bg-hazard/15 text-hazard'
                  : 'border-line bg-elevated text-soft'
              }`}
            >
              <span className="block">{s.title}</span>
              <span className="text-[10px] font-normal uppercase tracking-wider text-muted">
                {s.difficulty} · {s.map_size} · par {s.par}
              </span>
            </button>
          ))}
        </div>

        {briefing && <p className="mt-4 max-w-3xl text-sm text-soft">{briefing}</p>}

        {ended && score && (
          <div
            className={`animate-fade-up mt-5 rounded-2xl border px-4 py-3 text-sm ${
              score.status === 'success'
                ? 'border-ok/40 bg-ok/10 text-ok'
                : 'border-danger/40 bg-danger/10 text-danger'
            }`}
          >
            <p className="font-display text-lg font-bold">
              {score.status === 'success' ? 'Mission complete' : 'Mission failed'}
              {score.status === 'success' ? ` · ${starsLabel(score.stars)}` : ''}
            </p>
            <p className="mt-1 text-bright/90">
              {score.status === 'success'
                ? `Score ${score.score} · efficiency ${
                    score.efficiency != null ? (score.efficiency * 100).toFixed(0) + '%' : '—'
                  }`
                : `Failed (${score.reason ?? state.outcome ?? 'unknown'})`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Steps {state.step_count} · collisions {state.collisions} · native reward{' '}
              {metrics.native_total_reward}
              {comparison?.optimal_length != null
                ? ` · A* par ${comparison.optimal_length}`
                : entry
                  ? ` · par ${entry.par}`
                  : ''}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
          <div
            ref={boardRef}
            tabIndex={0}
            role="application"
            aria-label="Rescue mission board. WASD or arrows: tap one cell, hold to repeat."
            onFocus={() => {
              armedRef.current = true
              setBoardFocused(true)
            }}
            onBlur={(e) => {
              const next = e.relatedTarget
              if (next instanceof Node && e.currentTarget.contains(next)) {
                focusBoard()
                return
              }
              // Visual focus only — keyboard stays active via isActive() unless a form is focused.
              setBoardFocused(false)
            }}
            onPointerDownCapture={focusBoard}
            className={`relative h-[min(70vh,640px)] min-h-[360px] rounded-2xl outline-none ring-offset-2 ring-offset-void focus-visible:ring-2 focus-visible:ring-hazard/70 ${
              boardFocused ? 'ring-1 ring-hazard/30' : ''
            }`}
          >
            <RescueScene
              map={map}
              agent={agent}
              path={path}
              comparePath={astarPath}
              interactiveCamera
            />
            {collisionFlash && (
              <div
                className="pointer-events-none absolute inset-0 z-20 animate-fade-up rounded-2xl border-2 border-hazard bg-hazard/25"
                aria-live="polite"
              >
                <p className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-ink/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-hazard">
                  Blocked
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-line/80 bg-ink/75 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-soft backdrop-blur">
              <span className="mr-3 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-4 rounded-full bg-signal" /> Your path
              </span>
              {showAstar && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-hazard" /> A*
                </span>
              )}
            </div>
            {!boardFocused && !ended && (
              <button
                type="button"
                className="absolute inset-x-0 bottom-4 z-10 mx-auto w-fit rounded-md border border-line bg-ink/85 px-3 py-1.5 text-xs text-soft backdrop-blur"
                onClick={focusBoard}
              >
                Click board for keyboard · tap or hold-to-move
              </button>
            )}
          </div>

          <aside className="space-y-4">
            <div className="ws-panel rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">HUD</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Status</dt>
                  <dd
                    className={
                      score?.status === 'success'
                        ? 'font-bold text-ok'
                        : score?.status === 'failure'
                          ? 'font-bold text-danger'
                          : 'font-semibold text-bright'
                    }
                  >
                    {score?.status ?? 'in_progress'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Steps</dt>
                  <dd className="font-mono">
                    {state.step_count} / {state.max_steps}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Collisions</dt>
                  <dd className={`font-mono ${collisionFlash ? 'font-bold text-hazard' : ''}`}>
                    {state.collisions}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Native reward</dt>
                  <dd className="font-mono">{metrics.native_total_reward}</dd>
                </div>
                {score?.status === 'success' && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Score / stars</dt>
                    <dd className="font-mono text-ok">
                      {score.score} · {starsLabel(score.stars)}
                    </dd>
                  </div>
                )}
              </dl>
              <p
                className={`mt-3 text-xs ${collisionFlash ? 'font-semibold text-hazard' : 'text-soft'}`}
              >
                {collisionFlash
                  ? 'Blocked — wall or debris (hold stopped)'
                  : state.outcome
                    ? `Outcome: ${state.outcome}`
                    : 'Reach the green goal. Hazards end the run.'}
              </p>
            </div>

            <div className="ws-panel rounded-2xl p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Move
              </p>
              <DPad disabled={playDisabled} onPress={(a) => ctl.press(a)} />
              <p className="mt-3 text-[11px] leading-snug text-muted">
                <kbd className="text-signal">WASD</kbd> / arrows: tap = 1 step, hold = repeat every
                200 ms (t17u). D-pad = one click, one step.{' '}
                <kbd className="text-signal">R</kbd> restart · <kbd className="text-signal">U</kbd>{' '}
                undo · <kbd className="text-signal">H</kbd> A* after finish.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => ctl.restart()}
                className="rounded-xl bg-signal px-4 py-2.5 text-sm font-bold text-void"
              >
                Restart mission
              </button>
              <button
                type="button"
                onClick={() => ctl.undo()}
                disabled={undoDisabled}
                className="rounded-xl border border-line bg-elevated px-4 py-2.5 text-sm font-bold text-soft disabled:opacity-40"
              >
                Undo last step
              </button>
              <button
                type="button"
                disabled={!ended}
                onClick={() => ctl.toggleAStar()}
                className="rounded-xl border border-hazard/40 bg-hazard/10 px-4 py-2.5 text-sm font-bold text-hazard disabled:opacity-40"
              >
                {showAstar ? 'Hide A* route' : 'Compare my route vs A*'}
              </button>
              {showAstar && comparison && (
                <p className="text-xs text-muted">
                  Teal = your path · Amber = A* (
                  {comparison.optimal_length ?? '—'} steps). You used {comparison.player_steps}{' '}
                  steps
                  {comparison.extra_steps != null ? ` (${comparison.extra_steps} extra)` : ''}.
                </p>
              )}
            </div>

            <MapLegend />
            {manifest.disclaimer && (
              <p className="text-[10px] leading-snug text-muted">{manifest.disclaimer}</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
