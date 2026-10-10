import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts'
import { MapLegend } from '../components/simulation/MapLegend'
import { ReplayControls } from '../components/simulation/ReplayControls'
import { RescueScene } from '../components/simulation/RescueScene'
import { isLiveSimEnabled } from '../services/liveSimAdapter'
import { loadRescuePackage, trajectoriesForAgent } from '../services/rescueStatic'
import type { AgentPose, BuildingMap } from '../types/simulation'
import type { RescueStaticBundle, StaticTrajectory } from '../types/rescueStatic'

const IDLE_AGENT: AgentPose = { x: 2, y: 9, heading: 0, status: 'idle' }

const tooltipStyle = {
  background: '#11161d',
  border: '1px solid #243040',
  borderRadius: 8,
  fontSize: 12,
}

/** Recorded trajectory replays + charts (static package). Playable mission is /mission. */
export function SimulationLabPage() {
  const [bundle, setBundle] = useState<RescueStaticBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('')
  const [trajId, setTrajId] = useState<string>('')
  const [map, setMap] = useState<BuildingMap | null>(null)
  const [agent, setAgent] = useState<AgentPose>(IDLE_AGENT)
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const playRef = useRef<number | null>(null)

  const traj = bundle?.trajectories[trajId] ?? null
  const agentInfo = bundle?.agents[agentId] ?? null

  const agentTrajectories = useMemo(() => {
    if (!bundle || !agentId) return [] as StaticTrajectory[]
    return trajectoriesForAgent(bundle, agentId)
  }, [bundle, agentId])

  const evalBlock = useMemo(() => {
    if (!bundle || !agentId) return null
    for (const ev of Object.values(bundle.evaluations)) {
      const hit = ev.agents.find((a) => a.agent_id === agentId)
      if (hit && hit.episodes.length > 0) return hit
    }
    for (const ev of Object.values(bundle.evaluations)) {
      const hit = ev.agents.find((a) => a.agent_id === agentId)
      if (hit) return hit
    }
    return null
  }, [bundle, agentId])

  const training = useMemo(() => {
    if (!bundle || !agentId) return null
    return Object.values(bundle.training).find((t) => t.agent_id === agentId) ?? null
  }, [bundle, agentId])

  const applyFrame = useCallback((t: StaticTrajectory, idx: number) => {
    const f = t.frames[idx]
    if (!f) return
    setAgent(f.agent)
    setFrameIdx(idx)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadRescuePackage()
      .then((b) => {
        if (cancelled) return
        setBundle(b)
        const aId = b.manifest.default_agent_id
        const tId = b.manifest.default_trajectory_id
        setAgentId(aId)
        setTrajId(tId)
        const t = b.trajectories[tId]
        const m = t ? b.maps[t.map_id] : b.maps[b.manifest.default_map_id]
        if (m) setMap(m)
        if (t) applyFrame(t, 0)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load public/data/rescue/manifest.json',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applyFrame])

  useEffect(() => {
    if (!bundle || !trajId) return
    const t = bundle.trajectories[trajId]
    if (!t) return
    const m = bundle.maps[t.map_id]
    if (m) setMap(m)
    setPlaying(false)
    applyFrame(t, 0)
  }, [trajId, bundle, applyFrame])

  useEffect(() => {
    if (!playing || !traj) return
    const interval = Math.max(40, 220 / speed)
    playRef.current = window.setInterval(() => {
      setFrameIdx((i) => {
        const next = i + 1
        if (next >= traj.frames.length) {
          setPlaying(false)
          return i
        }
        const f = traj.frames[next]!
        setAgent(f.agent)
        return next
      })
    }, interval)
    return () => {
      if (playRef.current) window.clearInterval(playRef.current)
    }
  }, [playing, traj, speed])

  const onSelectAgent = (id: string) => {
    setAgentId(id)
    if (!bundle) return
    const list = trajectoriesForAgent(bundle, id)
    const next = list[0]
    if (next) setTrajId(next.id)
  }

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
            Trajectory Replays
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Random · PPO · A* recorded paths
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-soft">
            Playback controls, speed, and path trails from{' '}
            <code className="text-signal">public/data/rescue/</code>. For a playable mission use{' '}
            <Link className="font-semibold text-hazard hover:underline" to="/mission">
              Mission
            </Link>
            . Verified rates live on{' '}
            <Link className="font-semibold text-aurora hover:underline" to="/agents">
              AI Showdown
            </Link>
            .
          </p>
        </div>
        <MapLegend />
      </div>

      <div className="mb-4 rounded-xl border border-hazard/40 bg-hazard/10 px-4 py-3 text-sm text-bright">
        <strong className="text-hazard">Recorded evaluation mode</strong> — offline trajectories only.
        Not live PPO inference. Guided PPO has shortest-path access (see Showdown).
        {isLiveSimEnabled() && (
          <span className="mt-1 block text-xs text-muted">
            Optional live API adapter is configured (<code>VITE_LIVE_SIM_URL</code>) but this page
            still defaults to the static package.
          </span>
        )}
      </div>

      {loading && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-6">
          <div className="h-8 w-8 rounded-full border-2 border-signal/30 border-t-signal animate-spin-ring" />
          <p className="text-soft">Loading rescue package from manifest.json…</p>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          {error}
          <span className="mt-1 block text-xs text-muted">
            Copy the data handoff into <code>public/data/rescue/</code> and refresh.
          </span>
        </p>
      )}

      {bundle && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Agent</span>
              <select
                value={agentId}
                onChange={(e) => onSelectAgent(e.target.value)}
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
              >
                {bundle.manifest.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Recorded trajectory</span>
              <select
                value={trajId}
                onChange={(e) => setTrajId(e.target.value)}
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
              >
                {agentTrajectories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {agentInfo && (
            <p className="mb-3 text-xs text-muted">
              {agentInfo.name} · {agentInfo.kind} · {agentInfo.description}
            </p>
          )}

          <div className="mb-4 rounded-lg border border-line bg-panel p-3">
            <ReplayControls
              playing={playing}
              frameIdx={frameIdx}
              frameCount={traj?.frames.length ?? 0}
              speed={speed}
              disabled={!traj}
              onPlayPause={() => setPlaying((p) => !p)}
              onReset={() => {
                setPlaying(false)
                if (traj) applyFrame(traj, 0)
              }}
              onSpeed={setSpeed}
              onSeek={(idx) => {
                setPlaying(false)
                if (traj) applyFrame(traj, idx)
              }}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="h-[min(70vh,640px)]">
              {map ? (
                <RescueScene map={map} agent={agent} />
              ) : (
                <div className="grid h-full place-items-center rounded-lg border border-line bg-panel">
                  <p className="text-soft">No map loaded</p>
                </div>
              )}
            </div>

            <aside className="space-y-3 rounded-lg border border-line bg-panel p-4">
              <h2 className="font-display text-sm font-bold text-soft">Replay state</h2>
              <Stat label="Mode" value="recorded eval" />
              <Stat label="Position" value={`${agent.x.toFixed(0)}, ${agent.y.toFixed(0)}`} />
              <Stat label="Heading" value={`${((agent.heading * 180) / Math.PI).toFixed(0)}°`} />
              <Stat label="Status" value={agent.status} />
              {traj && (
                <>
                  <Stat
                    label="Victims"
                    value={`${traj.frames[frameIdx]?.victims_rescued ?? 0} rescued`}
                  />
                  <Stat
                    label="Outcome"
                    value={traj.summary.success ? 'success' : 'failed'}
                  />
                  <Stat label="Reward" value={String(traj.summary.reward ?? '—')} />
                </>
              )}
            </aside>
          </div>

          {bundle.manifest.comparisons && bundle.manifest.comparisons.length > 0 && (
            <section className="mt-6 rounded-lg border border-line bg-panel p-4">
              <h3 className="mb-1 font-display text-sm font-bold text-soft">
                Method comparison (recorded)
              </h3>
              <p className="mb-3 text-xs text-muted">
                Random vs A* vs PPO trajectories from the static package — not live races.
              </p>
              {bundle.manifest.comparisons.map((cmp) => (
                <div key={cmp.id} className="mb-3">
                  <p className="mb-2 text-sm text-bright">{cmp.title}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-2 py-1">Method</th>
                          <th className="px-2 py-1">Steps</th>
                          <th className="px-2 py-1">Victims</th>
                          <th className="px-2 py-1">Reward</th>
                          <th className="px-2 py-1">Result</th>
                          <th className="px-2 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {cmp.trajectory_ids.map((id) => {
                          const t = bundle.trajectories[id]
                          if (!t) return null
                          const ag = bundle.agents[t.agent_id]
                          return (
                            <tr key={id} className="border-t border-line/70">
                              <td className="px-2 py-1.5">{ag?.name ?? t.agent_id}</td>
                              <td className="px-2 py-1.5 font-mono">{t.summary.steps}</td>
                              <td className="px-2 py-1.5 font-mono">{t.summary.victims_rescued}</td>
                              <td className="px-2 py-1.5 font-mono">{t.summary.reward ?? '—'}</td>
                              <td className="px-2 py-1.5">
                                <span className={t.summary.success ? 'text-ok' : 'text-danger'}>
                                  {t.summary.success ? 'success' : 'failed'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-signal hover:underline"
                                  onClick={() => {
                                    setAgentId(t.agent_id)
                                    setTrajId(t.id)
                                  }}
                                >
                                  Load replay
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-panel p-4">
              <h3 className="mb-1 font-display text-sm font-bold text-soft">
                Evaluation episodes (recorded)
              </h3>
              <p className="mb-3 text-xs text-muted">
                Offline metrics from the static package — not a live eval run.
              </p>
              {evalBlock ? (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Metric
                      label="Success"
                      value={`${Math.round(evalBlock.metrics.success_rate * 100)}%`}
                    />
                    <Metric label="Mean reward" value={String(evalBlock.metrics.mean_reward)} />
                    <Metric label="Mean steps" value={String(evalBlock.metrics.mean_steps)} />
                    <Metric
                      label="Victims"
                      value={String(evalBlock.metrics.mean_victims_rescued)}
                    />
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={evalBlock.episodes}>
                        <CartesianGrid stroke="#243040" strokeDasharray="3 3" />
                        <XAxis dataKey="episode" stroke="#6b7c90" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#6b7c90" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="reward" fill="#2ee6d6" radius={[4, 4, 0, 0]} name="Reward" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">No evaluation block for this agent.</p>
              )}
            </section>

            <section className="rounded-lg border border-line bg-panel p-4">
              <h3 className="mb-1 font-display text-sm font-bold text-soft">
                Training history (recorded)
              </h3>
              <p className="mb-3 text-xs text-muted">
                Exported curve for display only — the browser does not train.
              </p>
              {training ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={training.curve}>
                      <CartesianGrid stroke="#243040" strokeDasharray="3 3" />
                      <XAxis dataKey="step" stroke="#6b7c90" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#6b7c90" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="reward"
                        stroke="#2ee6d6"
                        strokeWidth={2}
                        dot={false}
                        name="Reward"
                      />
                      <Line
                        type="monotone"
                        dataKey="success_rate"
                        stroke="#f5a623"
                        strokeWidth={2}
                        dot={false}
                        name="Success rate"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted">No training history for this agent.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-bright">{value}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-ink px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="font-display text-lg font-bold text-signal">{value}</p>
    </div>
  )
}
