import { useEffect, useMemo, useState, type RefObject } from 'react'
import { WorldViewer, type SwitchableWorld } from '../world/WorldViewer'
import type { WorldFrameMeta, WorldMetrics } from '../../types/world'
import { useWorldMemory } from '../../hooks/useWorldMemory'
import { WorldHeader } from './WorldHeader'
import { ExplorationMap } from './ExplorationMap'
import { CheckpointGallery } from './CheckpointGallery'
import { CheckpointPreview } from './CheckpointPreview'
import { RestoreOverlay } from './RestoreOverlay'
import { getMockWorldMemoryClient } from '../../services/worldMemory/mockWorldMemoryClient'
import type { InferredObstacle } from '../../types/worldMemory'

interface Props {
  worldName: string
  promptSummary: string
  hasFrame: boolean
  meta: WorldFrameMeta | null
  metrics: WorldMetrics | null
  phase: string
  mock: boolean
  error: string | null
  pointerLocked: boolean
  engineName: string | null
  stageRef: RefObject<HTMLDivElement | null>
  canvasElRef: RefObject<HTMLCanvasElement | null>
  onRequestLock: () => void
  onPause: () => void
  onReset: () => void
  onDisconnect: () => void
  onReconnect: () => void
  lookRisk?: 'ok' | 'elevated' | 'high'
  lookSensitivity?: number
  onLookSensitivity?: (v: number) => void
  lastSentMouse?: { dx: number; dy: number }
  idleHolding?: boolean
  stabilityMode?: boolean
  onStabilityMode?: (on: boolean) => void
  stabilityNotice?: string | null
  walkBudgetMs?: 0 | 22000 | 45000
  onWalkBudgetMs?: (ms: 0 | 22000 | 45000) => void
  worlds?: SwitchableWorld[]
  activeSeed?: string | null
  onSwitchWorld?: (seed: string | null) => void
  sessionId: string | null
  streamEpochHint: number
}

/**
 * Polished Explorer layout: header → live video → map → remembered views.
 * Memory/nav data is MOCK until Codex publishes docs/world-memory/API_CONTRACT.md.
 */
export function WorldExplorerShell(props: Props) {
  const memory = useWorldMemory()
  const [showTrail, setShowTrail] = useState(true)
  const [showObstacles, setShowObstacles] = useState(false)
  const [selectedObstacle, setSelectedObstacle] = useState<InferredObstacle | null>(null)
  const [saving, setSaving] = useState(false)
  const [centerTick, setCenterTick] = useState(false)

  useEffect(() => {
    memory.attach({
      sessionId: props.sessionId,
      worldName: props.worldName,
      promptSummary: props.promptSummary,
      epoch: props.streamEpochHint,
    })
    return () => memory.detach()
    // Re-attach when world/session identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionId, props.worldName, props.promptSummary])

  // MOCK estimate driver from footer look telemetry + keyboard — not live Codex nav.
  useEffect(() => {
    if (memory.source !== 'mock') return
    if (props.phase !== 'streaming' && !(props.phase === 'paused' && props.idleHolding)) return
    const id = window.setInterval(() => {
      const keys: string[] = []
      // Read live key state from a lightweight DOM-free poll via KeyboardEvent is hard;
      // use lastSentMouse for heading and infer WASD from a private mock buffer.
      const mock = getMockWorldMemoryClient()
      const held = (window as unknown as { __wsKeys?: Set<string> }).__wsKeys
      if (held) keys.push(...held)
      mock.noteControlHint({
        keys,
        mouseDx: props.lastSentMouse?.dx ?? 0,
        mouseDy: props.lastSentMouse?.dy ?? 0,
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [memory.source, props.phase, props.idleHolding, props.lastSentMouse])

  // Mirror WASD into a window set without stealing focus from stream handlers.
  useEffect(() => {
    const w = window as unknown as { __wsKeys?: Set<string> }
    w.__wsKeys = w.__wsKeys ?? new Set()
    const down = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        KeyW: 'w',
        KeyA: 'a',
        KeyS: 's',
        KeyD: 'd',
      }
      const k = map[e.code]
      if (k) w.__wsKeys!.add(k)
    }
    const up = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        KeyW: 'w',
        KeyA: 'a',
        KeyS: 's',
        KeyD: 'd',
      }
      const k = map[e.code]
      if (k) w.__wsKeys!.delete(k)
    }
    const blur = () => w.__wsKeys!.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const selected = useMemo(
    () =>
      memory.session.checkpoints.find((c) => c.id === memory.session.selectedCheckpointId) ?? null,
    [memory.session.checkpoints, memory.session.selectedCheckpointId],
  )

  const statusLabel = [
    props.phase,
    props.mock ? 'stream MOCK' : 'Waypoint live',
    props.engineName ?? '',
    memory.source === 'mock' ? 'nav/memory MOCK' : 'nav live',
  ]
    .filter(Boolean)
    .join(' · ')

  const restoring =
    !!memory.session.restore &&
    memory.session.restore.phase !== 'complete' &&
    memory.session.restore.phase !== 'failed'

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col bg-void">
      <WorldHeader
        worldName={props.worldName}
        promptSummary={props.promptSummary}
        statusLabel={statusLabel}
        source={memory.session.source}
        pose={memory.session.pose}
        saving={saving}
        canRestore={!!selected?.restorable && !restoring}
        onSaveView={() => {
          setSaving(true)
          void memory.saveView().finally(() => setSaving(false))
        }}
        onRestoreSelected={() => {
          if (selected) void memory.restoreCheckpoint(selected.id)
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative">
          <WorldViewer
            embedded
            hasFrame={props.hasFrame}
            meta={props.meta}
            metrics={props.metrics}
            phase={props.phase}
            mock={props.mock}
            error={props.error}
            pointerLocked={props.pointerLocked}
            engineName={props.engineName}
            stageRef={props.stageRef}
            canvasElRef={props.canvasElRef}
            onRequestLock={props.onRequestLock}
            onPause={props.onPause}
            onReset={props.onReset}
            onDisconnect={props.onDisconnect}
            onReconnect={props.onReconnect}
            lookRisk={props.lookRisk}
            lookSensitivity={props.lookSensitivity}
            onLookSensitivity={props.onLookSensitivity}
            lastSentMouse={props.lastSentMouse}
            idleHolding={props.idleHolding}
            stabilityMode={props.stabilityMode}
            onStabilityMode={props.onStabilityMode}
            stabilityNotice={props.stabilityNotice}
            walkBudgetMs={props.walkBudgetMs}
            onWalkBudgetMs={props.onWalkBudgetMs}
            worlds={props.worlds}
            activeSeed={props.activeSeed}
            onSwitchWorld={props.onSwitchWorld}
          />
          <RestoreOverlay job={memory.session.restore} checkpoint={selected} />
        </div>

        <section className="space-y-3 border-t border-line bg-void px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-bright">Exploration map</h2>
              <p className="text-xs text-muted">
                Estimated trail in this session&apos;s frame — not geographic. Markers are remembered
                views.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-soft hover:text-bright"
                onClick={() => setShowTrail((v) => !v)}
              >
                {showTrail ? 'Hide trail' : 'Show trail'}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-soft hover:text-bright">
                <input
                  type="checkbox"
                  checked={showObstacles}
                  onChange={(e) => {
                    setShowObstacles(e.target.checked)
                    if (!e.target.checked) setSelectedObstacle(null)
                  }}
                  className="accent-[var(--color-signal,#5eead4)]"
                />
                AI-Inferred Obstacles
              </label>
              <button
                type="button"
                className="rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-soft hover:text-bright"
                onClick={() => {
                  memory.requestCenterOnPlayer()
                  setCenterTick(true)
                }}
              >
                Center on player
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="h-[260px] sm:h-[300px]">
              <ExplorationMap
                pose={memory.session.pose}
                trail={memory.session.trail}
                checkpoints={memory.session.checkpoints}
                selectedId={memory.session.selectedCheckpointId}
                onSelect={(id) => {
                  setSelectedObstacle(null)
                  memory.selectCheckpoint(id)
                }}
                centerRequest={centerTick || memory.centerPending()}
                onCenterConsumed={() => {
                  setCenterTick(false)
                  memory.consumeCenterRequest()
                }}
                showTrail={showTrail}
                mock={memory.source === 'mock'}
                showObstacles={showObstacles}
                selectedObstacleId={selectedObstacle?.id ?? null}
                onSelectObstacle={(obs) => {
                  setSelectedObstacle(obs)
                  memory.selectCheckpoint(obs.checkpointId)
                }}
              />
            </div>
            <aside className="rounded-xl border border-line bg-panel/70 p-3 text-xs text-soft">
              <p className="font-semibold text-bright">Legend</p>
              <ul className="mt-2 space-y-1.5 text-muted">
                <li>
                  <span className="text-hazard">●</span> Start
                </li>
                <li>
                  <span className="text-signal">●</span> Selected memory
                </li>
                <li>
                  <span className="text-soft">●</span> Remembered view
                </li>
                <li>Arrow — estimated heading</li>
                <li>Trail breaks after restore</li>
                {showObstacles && (
                  <>
                    <li>
                      <span className="text-danger">◌</span> Blocked (inferred)
                    </li>
                    <li>
                      <span className="text-hazard">◌</span> Hazard (inferred)
                    </li>
                    <li>
                      <span className="text-ok">◌</span> Possibly walkable
                    </li>
                    <li className="text-[10px]">Opacity ≈ confidence — not collision mesh</li>
                  </>
                )}
              </ul>
              <p className="mt-3 text-[10px] leading-relaxed text-muted">
                Memory / navigation / obstacles are MOCK until Codex publishes the world-memory
                contract. Live video remains the real Waypoint stream when connected.
              </p>
            </aside>
          </div>

          <CheckpointPreview
            checkpoint={selected}
            linkedObstacle={selectedObstacle}
            enhancementSupported={memory.session.enhancementSupported}
            onRestore={(id) => void memory.restoreCheckpoint(id)}
            restoring={restoring}
          />

          <CheckpointGallery
            checkpoints={memory.session.checkpoints}
            selectedId={memory.session.selectedCheckpointId}
            onSelect={(id) => {
              setSelectedObstacle(null)
              memory.selectCheckpoint(id)
            }}
            onRestore={(id) => void memory.restoreCheckpoint(id)}
            restoring={restoring}
          />
        </section>
      </div>
    </div>
  )
}
