import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { loadRescuePackage } from '../services/rescueStatic'
import { isLiveSimEnabled, liveSimAdapter } from '../services/liveSimAdapter'
import type { RescueStaticBundle, StaticEvalAgentBlock } from '../types/rescueStatic'

const tooltipStyle = {
  background: '#11161d',
  border: '1px solid #243040',
  borderRadius: 8,
  fontSize: 12,
}

export function AgentDashboardPage() {
  const [bundle, setBundle] = useState<RescueStaticBundle | null>(null)
  const [agentId, setAgentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveNote, setLiveNote] = useState<string | null>(null)

  useEffect(() => {
    loadRescuePackage()
      .then((b) => {
        setBundle(b)
        setAgentId(b.manifest.default_agent_id)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load static package'))
      .finally(() => setLoading(false))
  }, [])

  const evalDoc = useMemo(() => {
    if (!bundle) return null
    return Object.values(bundle.evaluations)[0] ?? null
  }, [bundle])

  const block: StaticEvalAgentBlock | null = useMemo(() => {
    if (!evalDoc || !agentId) return null
    return evalDoc.agents.find((a) => a.agent_id === agentId) ?? null
  }, [evalDoc, agentId])

  const training = useMemo(() => {
    if (!bundle || !agentId) return null
    return Object.values(bundle.training).find((t) => t.agent_id === agentId) ?? null
  }, [bundle, agentId])

  const tryLiveEval = async () => {
    if (!isLiveSimEnabled()) {
      setLiveNote('Live adapter off — set VITE_LIVE_SIM_URL to enable optional API eval.')
      return
    }
    try {
      setLiveNote('Calling live evaluate…')
      const r = await liveSimAdapter.evaluate({
        agent_id: agentId,
        scenario_id: evalDoc?.scenario_id ?? 'facility_a_night',
        episodes: 8,
      })
      setLiveNote(
        `Live eval returned ${r.evaluation_id} (success ${(r.metrics.success_rate * 100).toFixed(0)}%). Static charts above are unchanged.`,
      )
    } catch (err) {
      setLiveNote(err instanceof Error ? err.message : 'Live eval failed')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Agent Training & Evaluation
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Recorded evaluation dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-soft">
          Charts and episode tables come from the static rescue package. This page does not run PPO
          or contact a training service by default.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-hazard/40 bg-hazard/10 px-4 py-3 text-sm">
        <strong className="text-hazard">Recorded evaluation</strong> — not live agent training.
      </div>

      {loading && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-6">
          <div className="h-8 w-8 rounded-full border-2 border-signal/30 border-t-signal animate-spin-ring" />
          <p className="text-soft">Loading evaluations from public/data/rescue/…</p>
        </div>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {bundle && evalDoc && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Agent</span>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
              >
                {bundle.manifest.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void tryLiveEval()}
              className="rounded-md border border-line bg-elevated px-3 py-2 text-sm font-semibold text-muted transition hover:border-signal/40 hover:text-signal"
            >
              Optional live API eval…
            </button>
          </div>
          {liveNote && <p className="mb-4 text-xs text-muted">{liveNote}</p>}

          <p className="mb-4 text-xs text-muted">{evalDoc.note}</p>

          {block && (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric
                  label="Success rate"
                  value={`${Math.round(block.metrics.success_rate * 100)}%`}
                />
                <Metric label="Mean reward" value={String(block.metrics.mean_reward)} />
                <Metric label="Mean steps" value={String(block.metrics.mean_steps)} />
                <Metric label="Mean latency" value={`${block.metrics.mean_latency_ms} ms`} />
                <Metric
                  label="Victims rescued"
                  value={String(block.metrics.mean_victims_rescued)}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-line bg-panel p-4">
                  <h3 className="mb-3 font-display text-sm font-bold text-soft">
                    Episode rewards (recorded)
                  </h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={block.episodes}>
                        <CartesianGrid stroke="#243040" strokeDasharray="3 3" />
                        <XAxis dataKey="episode" stroke="#6b7c90" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#6b7c90" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="reward" fill="#2ee6d6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-panel p-4">
                  <h3 className="mb-3 font-display text-sm font-bold text-soft">
                    Training history (recorded)
                  </h3>
                  <div className="h-56">
                    {training ? (
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
                          />
                          <Line
                            type="monotone"
                            dataKey="success_rate"
                            stroke="#f5a623"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted">No training curve for this agent.</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="mt-6 overflow-hidden rounded-lg border border-line bg-panel">
                <div className="border-b border-line px-4 py-3">
                  <h2 className="font-display text-sm font-bold text-soft">Episode table</h2>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-elevated text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-2">Ep</th>
                        <th className="px-4 py-2">Reward</th>
                        <th className="px-4 py-2">Steps</th>
                        <th className="px-4 py-2">Success</th>
                        <th className="px-4 py-2">Victims</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.episodes.map((ep) => (
                        <tr key={ep.episode} className="border-t border-line/70">
                          <td className="px-4 py-2 font-mono">{ep.episode}</td>
                          <td className="px-4 py-2 font-mono">{ep.reward}</td>
                          <td className="px-4 py-2 font-mono">{ep.steps}</td>
                          <td className="px-4 py-2">
                            <span className={ep.success ? 'text-ok' : 'text-danger'}>
                              {ep.success ? 'yes' : 'no'}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono">{ep.victims_rescued}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-signal">{value}</p>
    </div>
  )
}
