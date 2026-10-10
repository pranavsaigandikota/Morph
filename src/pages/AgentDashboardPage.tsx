import { useCallback, useState } from 'react'
import { EvaluationCharts } from '../components/agents/EvaluationCharts'
import { agentsApi } from '../services/agentsApi'
import type { AgentReplaySummary, EvaluationResult } from '../types/agents'

export function AgentDashboardPage() {
  const [agentId, setAgentId] = useState('rescue-policy-v1')
  const [scenarioId, setScenarioId] = useState('facility_a_night')
  const [episodes, setEpisodes] = useState(12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [replays, setReplays] = useState<AgentReplaySummary[]>([])
  const [selectedReplay, setSelectedReplay] = useState<AgentReplaySummary | null>(null)

  const runEval = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const evalResult = await agentsApi.evaluate({
        agent_id: agentId,
        scenario_id: scenarioId,
        episodes,
      })
      setResult(evalResult)
      const list = await agentsApi.listReplays()
      setReplays(list)
      setSelectedReplay(list[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed')
    } finally {
      setLoading(false)
    }
  }, [agentId, episodes, scenarioId])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Agent Training & Evaluation
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Policy evaluation dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-soft">
          Run mock evaluations against the agent contract. Charts and replay summaries are ready for
          real backend wiring — no RL training is performed in the browser.
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-line bg-panel p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Agent ID">
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
            />
          </Field>
          <Field label="Scenario ID">
            <input
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
            />
          </Field>
          <Field label="Episodes">
            <input
              type="number"
              min={1}
              max={50}
              value={episodes}
              onChange={(e) => setEpisodes(Number(e.target.value))}
              className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => void runEval()}
          disabled={loading}
          className="mt-4 rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90 disabled:opacity-40"
        >
          {loading ? 'Evaluating…' : 'Run evaluation'}
        </button>
        {error && (
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </section>

      {loading && !result && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-6">
          <div className="h-8 w-8 rounded-full border-2 border-signal/30 border-t-signal animate-spin-ring" />
          <p className="text-soft">Running mock evaluation episodes…</p>
        </div>
      )}

      {result && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Success rate" value={`${Math.round(result.metrics.success_rate * 100)}%`} />
            <Metric label="Mean reward" value={String(result.metrics.mean_reward)} />
            <Metric label="Mean steps" value={String(result.metrics.mean_steps)} />
            <Metric label="Mean latency" value={`${result.metrics.mean_latency_ms} ms`} />
            <Metric label="Victims rescued" value={String(result.metrics.mean_victims_rescued)} />
          </div>

          <EvaluationCharts result={result} />

          <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
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
                      <th className="px-4 py-2">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.episodes.map((ep) => (
                      <tr key={ep.episode} className="border-t border-line/70">
                        <td className="px-4 py-2 font-mono">{ep.episode}</td>
                        <td className="px-4 py-2 font-mono">{ep.reward}</td>
                        <td className="px-4 py-2 font-mono">{ep.steps}</td>
                        <td className="px-4 py-2">
                          <span className={ep.success ? 'text-ok' : 'text-danger'}>
                            {ep.success ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono">{ep.latency_ms}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-lg border border-line bg-panel p-4">
              <h2 className="font-display text-sm font-bold text-soft">Replay controls</h2>
              <p className="mt-1 text-xs text-muted">
                Select a stored agent replay summary from the evaluation run.
              </p>
              <ul className="mt-3 space-y-2">
                {replays.length === 0 && (
                  <li className="text-sm text-muted">No replays yet.</li>
                )}
                {replays.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedReplay(r)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                        selectedReplay?.id === r.id
                          ? 'border-signal bg-elevated text-signal'
                          : 'border-line hover:border-signal/40'
                      }`}
                    >
                      <span className="block font-mono text-xs text-muted">{r.id}</span>
                      <span className="mt-0.5 block">
                        {r.success ? 'Success' : 'Failed'} · {r.steps} steps · reward {r.reward}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selectedReplay && (
                <div className="mt-4 rounded-md border border-line bg-ink p-3 text-xs leading-relaxed text-soft">
                  <p>
                    <span className="text-muted">Agent:</span> {selectedReplay.agent_id}
                  </p>
                  <p>
                    <span className="text-muted">Scenario:</span> {selectedReplay.scenario_id}
                  </p>
                  <p>
                    <span className="text-muted">Created:</span>{' '}
                    {new Date(selectedReplay.created_at).toLocaleString()}
                  </p>
                  <p className="mt-2 text-muted">
                    Open the Rescue Lab to scrub spatial replay frames for the same facility map.
                  </p>
                </div>
              )}
            </aside>
          </section>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-muted">{label}</span>
      {children}
    </label>
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
