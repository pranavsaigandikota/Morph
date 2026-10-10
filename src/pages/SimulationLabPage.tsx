import { useCallback, useEffect, useRef, useState } from 'react'
import { MapLegend } from '../components/simulation/MapLegend'
import { RescueScene } from '../components/simulation/RescueScene'
import { simulationApi } from '../services/simulationApi'
import type { AgentPose, BuildingMap, ReplayFrame, SimulationReplay } from '../types/simulation'

const IDLE_AGENT: AgentPose = {
  x: 2,
  y: 9,
  heading: 0,
  status: 'idle',
}

export function SimulationLabPage() {
  const [map, setMap] = useState<BuildingMap | null>(null)
  const [agent, setAgent] = useState<AgentPose>(IDLE_AGENT)
  const [simId, setSimId] = useState<string | null>(null)
  const [replay, setReplay] = useState<SimulationReplay | null>(null)
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Create a simulation to load the facility map.')
  const playRef = useRef<number | null>(null)

  const applyFrame = useCallback((frames: ReplayFrame[], idx: number) => {
    const f = frames[idx]
    if (!f) return
    setAgent(f.agent)
    setFrameIdx(idx)
  }, [])

  const createAndLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPlaying(false)
    setReplay(null)
    try {
      const created = await simulationApi.create({ map_id: 'facility_a', seed: 42 })
      setSimId(created.id)
      const state = await simulationApi.get(created.id)
      setMap(state.map)
      setAgent(state.agent)
      setStatus(`Simulation ${created.id} ready · map ${state.map.name}`)
      setFrameIdx(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create simulation')
    } finally {
      setLoading(false)
    }
  }, [])

  const runSteps = useCallback(async () => {
    if (!simId) return
    setLoading(true)
    setError(null)
    try {
      let done = false
      let guard = 0
      while (!done && guard < 80) {
        const res = await simulationApi.step(simId)
        setAgent(res.state.agent)
        setStatus(
          `Step ${res.state.step} · rescued ${res.state.victims_rescued} · ${res.state.agent.status}`,
        )
        done = res.done
        guard += 1
        await new Promise((r) => setTimeout(r, 40))
      }
      const full = await simulationApi.replay(simId)
      setReplay(full)
      setMap(full.map)
      applyFrame(full.frames, full.frames.length - 1)
      setStatus(
        `Complete · ${full.summary.success ? 'success' : 'failed'} · ${full.summary.steps} steps · ${full.summary.victims_rescued} rescued`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Step failed')
    } finally {
      setLoading(false)
    }
  }, [applyFrame, simId])

  const loadReplay = useCallback(async () => {
    if (!simId) return
    setLoading(true)
    setError(null)
    try {
      const full = await simulationApi.replay(simId)
      setReplay(full)
      setMap(full.map)
      applyFrame(full.frames, 0)
      setStatus(`Replay loaded · ${full.frames.length} frames`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay failed')
    } finally {
      setLoading(false)
    }
  }, [applyFrame, simId])

  useEffect(() => {
    void createAndLoad()
  }, [createAndLoad])

  useEffect(() => {
    if (!playing || !replay) return
    playRef.current = window.setInterval(() => {
      setFrameIdx((i) => {
        const next = i + 1
        if (next >= replay.frames.length) {
          setPlaying(false)
          return i
        }
        const f = replay.frames[next]!
        setAgent(f.agent)
        return next
      })
    }, 220)
    return () => {
      if (playRef.current) window.clearInterval(playRef.current)
    }
  }, [playing, replay])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
            Rescue Simulation Lab
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Deterministic facility simulator
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-soft">
            Walls, hazards, and exits come from the simulation contract — never inferred from
            generated video.
          </p>
        </div>
        <MapLegend />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Action onClick={() => void createAndLoad()} disabled={loading}>
          New simulation
        </Action>
        <Action onClick={() => void runSteps()} disabled={loading || !simId}>
          Run to completion
        </Action>
        <Action onClick={() => void loadReplay()} disabled={loading || !simId}>
          Load replay
        </Action>
        <Action
          onClick={() => setPlaying((p) => !p)}
          disabled={!replay || replay.frames.length < 2}
        >
          {playing ? 'Pause replay' : 'Play replay'}
        </Action>
        {replay && (
          <input
            type="range"
            min={0}
            max={Math.max(0, replay.frames.length - 1)}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false)
              applyFrame(replay.frames, Number(e.target.value))
            }}
            className="ml-2 w-40 accent-signal"
            aria-label="Replay scrubber"
          />
        )}
      </div>

      <p className="mb-3 text-sm text-muted">{status}</p>
      {error && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="h-[min(70vh,640px)]">
          {map ? (
            <RescueScene map={map} agent={agent} />
          ) : (
            <div className="grid h-full place-items-center rounded-lg border border-line bg-panel">
              <div className="text-center">
                <div className="mx-auto mb-3 h-9 w-9 rounded-full border-2 border-signal/30 border-t-signal animate-spin-ring" />
                <p className="text-soft">Loading facility map…</p>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <h2 className="font-display text-sm font-bold text-soft">Agent state</h2>
          <Stat label="Position" value={`${agent.x.toFixed(0)}, ${agent.y.toFixed(0)}`} />
          <Stat label="Heading" value={`${((agent.heading * 180) / Math.PI).toFixed(0)}°`} />
          <Stat label="Status" value={agent.status} />
          {replay && (
            <>
              <Stat label="Frame" value={`${frameIdx + 1} / ${replay.frames.length}`} />
              <Stat label="Victims rescued" value={String(replay.frames[frameIdx]?.victims_rescued ?? 0)} />
              <Stat
                label="Outcome"
                value={replay.summary.success ? 'success' : 'failed'}
              />
            </>
          )}
          <p className="pt-2 text-xs leading-relaxed text-muted">
            Orbit with mouse · scroll to zoom. Sample map: Research Facility A — Sublevel 2.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Action({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-line bg-elevated px-3 py-1.5 text-sm font-semibold text-bright transition hover:border-signal/40 hover:text-signal disabled:opacity-40"
    >
      {children}
    </button>
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
