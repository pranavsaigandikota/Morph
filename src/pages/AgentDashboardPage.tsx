import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import type { RescueStaticBundle, StaticEvalAgentBlock } from '../types/rescueStatic'

const tooltipStyle = {
  background: '#10161f',
  border: '1px solid #243246',
  borderRadius: 10,
  fontSize: 12,
}

function ratePair(block: StaticEvalAgentBlock): string {
  const a = (block.metrics.success_rate * 100).toFixed(1)
  const b =
    block.metrics.success_rate_b != null
      ? (block.metrics.success_rate_b * 100).toFixed(1)
      : null
  return b ? `${a}% / ${b}%` : `${a}%`
}

const SHOWDOWN_ORDER = ['random-walker', 'ppo-path-guidance', 'astar-planner']

export function AgentDashboardPage() {
  const [bundle, setBundle] = useState<RescueStaticBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadRescuePackage()
      .then(setBundle)
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
  }, [])

  const showdown = useMemo(() => {
    if (!bundle) return null
    return bundle.evaluations['eval_verified_showdown'] ?? null
  }, [bundle])

  const showdownAgents = useMemo(() => {
    if (!showdown) return [] as StaticEvalAgentBlock[]
    return SHOWDOWN_ORDER.map((id) => showdown.agents.find((a) => a.agent_id === id)).filter(
      Boolean,
    ) as StaticEvalAgentBlock[]
  }, [showdown])

  const barData = showdownAgents.map((a) => ({
    name: a.display_name ?? a.agent_id,
    scenarioA: Math.round(a.metrics.success_rate * 1000) / 10,
    scenarioB:
      a.metrics.success_rate_b != null
        ? Math.round(a.metrics.success_rate_b * 1000) / 10
        : undefined,
  }))

  const training = bundle ? Object.values(bundle.training)[0] : null

  if (error) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-danger">{error}</div>
  }

  if (!bundle) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-soft">
        Loading verified evaluation package…
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere opacity-70" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-aurora">AI Showdown</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Random vs PPO + Path Guidance vs A*
        </h1>
        <p className="mt-3 max-w-3xl text-soft">
          <strong className="text-bright">Recorded evaluation</strong> — not live AI inference.
          Guided PPO has access to shortest-path information. Dual rates are scenario A / scenario B
          success.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">
            Offline verified metrics
          </span>
          <Link
            to="/mission"
            className="rounded-full border border-hazard/40 bg-hazard/10 px-3 py-1 text-xs font-semibold text-hazard"
          >
            Play the same map yourself →
          </Link>
          <Link
            to="/simulation"
            className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-soft"
          >
            Replay trajectories
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {showdownAgents.map((a, i) => {
            const accents = ['text-muted border-line', 'text-signal border-signal/40', 'text-hazard border-hazard/40']
            return (
              <div
                key={a.agent_id}
                className={`ws-panel animate-fade-up rounded-2xl border p-5 ${accents[i] ?? accents[0]}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                  {a.display_name ?? a.agent_id}
                </p>
                <p className="mt-3 font-display text-3xl font-extrabold text-bright">
                  {ratePair(a)}
                </p>
                <p className="mt-2 text-xs text-soft">{a.note}</p>
              </div>
            )
          })}
        </div>

        {!showdown && (
          <p className="mt-6 text-sm text-danger">
            Verified showdown file missing — expected evaluations/eval_verified_showdown.json
          </p>
        )}

        <div className="mt-10 ws-panel rounded-2xl p-5">
          <h2 className="font-display text-lg font-bold">Success rates (verified)</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#243246" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#9aabbe', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#9aabbe', fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="scenarioA" name="Scenario A %" fill="#2ee6d6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="scenarioB" name="Scenario B %" fill="#7c6cff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {training && (
          <div className="mt-8 ws-panel rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold">{training.title}</h2>
            <p className="mt-1 text-xs text-muted">
              Training progression (recorded). Separate from the verified showdown rates above.
            </p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={training.curve}>
                  <CartesianGrid stroke="#243246" strokeDasharray="3 3" />
                  <XAxis dataKey="step" tick={{ fill: '#9aabbe', fontSize: 11 }} />
                  <YAxis
                    yAxisId="r"
                    tick={{ fill: '#9aabbe', fontSize: 11 }}
                    domain={[0, 1]}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    yAxisId="r"
                    type="monotone"
                    dataKey="success_rate"
                    stroke="#2ee6d6"
                    strokeWidth={2}
                    dot={false}
                    name="Success rate"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <p className="mt-8 text-xs text-muted">
          Package mode: <code className="text-signal">{bundle.manifest.mode}</code> · Legacy
          facility-night eval remains in the package for reference and is not the showdown headline.
        </p>
      </div>
    </div>
  )
}
