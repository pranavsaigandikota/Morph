import { useEffect, useMemo, useState, type RefObject } from 'react'
import { WorldViewer, type SwitchableWorld } from '../world/WorldViewer'
import type { WorldFrameMeta, WorldMetrics } from '../../types/world'
import { useWorldMemory } from '../../hooks/useWorldMemory'
import { WorldHeader } from './WorldHeader'
import { ExplorationMap } from './ExplorationMap'
import { CheckpointPreview } from './CheckpointPreview'
import { RestoreOverlay } from './RestoreOverlay'
import { MemoryGallery, type GalleryFilter } from './MemoryGallery'
import { HuggingFaceAttribution } from '../brand/HuggingFaceAttribution'
import { getMockWorldMemoryClient } from '../../services/worldMemory/mockWorldMemoryClient'
import { MAP_SCALE } from '../../services/worldMemory/liveWorldMemoryClient'
import { loadCalibrationSession } from '../../services/calibration/mockCalibration'
import type { ObstacleObservation } from '../../types/worldMemory'
import type { CalibrationCapture } from '../../types/calibration'

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
  /** Explicit return to the original start seed. */
  onResetToStart?: () => void
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
 * Explorer layout: prominent 16:9 world → map → gallery.
 * Memory/nav/calibration data is MOCK until Claude/Codex contracts land.
 */
export function WorldExplorerShell(props: Props) {
  const memory = useWorldMemory()
  const [showTrail, setShowTrail] = useState(true)
  const [showObstacles, setShowObstacles] = useState(false)
  const [selectedObstacle, setSelectedObstacle] = useState<ObstacleObservation | null>(null)
  const [saving, setSaving] = useState(false)
  const [centerTick, setCenterTick] = useState(false)
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all')
  const [calibrationCaptures, setCalibrationCaptures] = useState<CalibrationCapture[]>([])
  const [refreshFlash, setRefreshFlash] = useState(false)

  useEffect(() => {
    memory.attach({
      sessionId: props.sessionId,
      worldName: props.worldName,
      promptSummary: props.promptSummary,
      epoch: props.streamEpochHint,
    })
    const cal = loadCalibrationSession()
    setCalibrationCaptures(cal?.captures ?? [])
    return () => memory.detach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionId, props.worldName, props.promptSummary, memory.source])

  useEffect(() => {
    if (memory.source !== 'mock') return
    if (props.phase !== 'streaming' && !(props.phase === 'paused' && props.idleHolding)) return
    const id = window.setInterval(() => {
      const keys: string[] = []
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
    calibrationCaptures.length ? `cal ${calibrationCaptures.length} MOCK` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const restoring =
    !!memory.session.restore &&
    memory.session.restore.phase !== 'complete' &&
    memory.session.restore.phase !== 'failed'

  const live = memory.source === 'live'
  const [lastRestoredAnchor, setLastRestoredAnchor] = useState<string | null>(null)

  const onRefreshWorld = () => {
    if (live && memory.captureAnchor) {
      // Clean up the current view in place (enhanced) — no jump back to the start.
      void memory.captureAnchor(true).then((cp) => cp && setLastRestoredAnchor(cp.id))
      return
    }
    setRefreshFlash(true)
    props.onReset()
    window.setTimeout(() => setRefreshFlash(false), 2200)
  }

  // Saved clear views you can return to: player-captured anchors and the start seed (approved).
  const anchors = useMemo(
    () =>
      memory.session.checkpoints.filter(
        (c) => c.pose && c.restorable && (c.kind === 'clear_view_anchor' || c.kind === 'sdxl_starter'),
      ),
    [memory.session.checkpoints],
  )
  // Estimated match: within ~1.2 units (≈1 s walking) and ±35° heading. The map is an estimate, so this is
  // a suggestion the player confirms with Space, never an automatic jump.
  const nearAnchor = useMemo(() => {
    if (!live) return null
    const p = memory.session.pose
    type Near = { id: string; d: number; dh: number; name: string }
    const candidates: Near[] = anchors
      .map((a) => ({
        id: a.id,
        name: a.name,
        d: Math.hypot(a.pose!.x - p.x, a.pose!.y - p.y) / MAP_SCALE,
        dh: Math.abs(((a.pose!.headingDeg - p.headingDeg + 540) % 360) - 180),
      }))
      .filter((c) => c.d <= 1.2 && c.dh <= 35)
      .sort((x, y) => x.d - y.d)
    const best: Near | null = candidates[0] ?? null
    if (best && best.id === lastRestoredAnchor && best.d < 0.6) return null
    return best
  }, [anchors, live, memory.session.pose, lastRestoredAnchor])

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.repeat) return
      if (e.code === 'Space' && nearAnchor) {
        e.preventDefault()
        setLastRestoredAnchor(nearAnchor.id)
        void memory.restoreCheckpoint(nearAnchor.id)
      } else if (e.code === 'KeyC' && memory.captureAnchor) {
        void memory.captureAnchor(false)
      } else if (e.code === 'KeyR') {
        onRefreshWorld()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, nearAnchor, memory.captureAnchor])

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col bg-void">
      <WorldHeader
        worldName={props.worldName}
        promptSummary={props.promptSummary}
        statusLabel={statusLabel}
        source={memory.session.source}
        pose={memory.session.pose}
        saving={saving}
        canRestore={
          !!selected?.restorable && selected.recoverySuitable !== false && !restoring
        }
        onSaveView={() => {
          setSaving(true)
          void memory.saveView().finally(() => setSaving(false))
        }}
        onRestoreSelected={() => {
          if (selected) void memory.restoreCheckpoint(selected.id)
        }}
        onRefreshWorld={onRefreshWorld}
        refreshDisabled={!props.hasFrame && props.phase !== 'streaming' && props.phase !== 'paused'}
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
            onReset={onRefreshWorld}
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
          {live && (
            <div className="mx-auto mt-2 flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-3 text-xs text-muted">
              <span>
                WASD move · Shift sprint · I/J/K/L look (up/left/down/right) · C capture clear view · R refresh
                here · Space go to saved view
              </span>
              <span className="flex gap-2">
                {memory.captureAnchor && (
                  <button
                    type="button"
                    className="rounded-md border border-line bg-elevated px-2.5 py-1 font-semibold text-soft hover:text-bright"
                    onClick={() => void memory.captureAnchor!(false)}
                  >
                    Capture clear view (C)
                  </button>
                )}
                {props.onResetToStart && (
                  <button
                    type="button"
                    className="rounded-md border border-line bg-elevated px-2.5 py-1 font-semibold text-soft hover:text-bright"
                    onClick={props.onResetToStart}
                  >
                    Reset to start
                  </button>
                )}
              </span>
            </div>
          )}
          {nearAnchor && !restoring && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-40 mx-auto w-fit rounded-lg border border-signal/60 bg-panel/90 px-4 py-2 text-sm text-bright shadow-lg">
              Saved clear view here (“{nearAnchor.name}”, est. {nearAnchor.d.toFixed(1)} units away) — press{' '}
              <kbd className="rounded border border-line px-1">Space</kbd> to switch to it
            </div>
          )}
          <RestoreOverlay
            job={
              refreshFlash && !memory.session.restore
                ? {
                    checkpointId: selected?.id ?? 'refresh',
                    phase: 'reinitializing',
                    message:
                      'Refreshing from original seed via existing /world/reset — a new viewpoint may appear.',
                    startedAtMs: performance.now(),
                  }
                : memory.session.restore
            }
            checkpoint={selected}
            refreshMode={refreshFlash && !memory.session.restore}
          />
        </div>

        <section className="space-y-3 border-t border-line bg-void px-3 py-4 sm:px-4 lg:px-6">
          <div className="mx-auto max-w-[1400px] space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-bright">Exploration map</h2>
                <p className="text-xs text-muted">
                  Estimated position, heading, calibration rays, checkpoints, and trail — not
                  geographic / not physical meters.
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

            <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
              <div className="h-[240px] sm:h-[280px] xl:h-[320px]">
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
                  selectedObstacleId={selectedObstacle?.observation_id ?? null}
                  onSelectObstacle={(obs) => {
                    setSelectedObstacle(obs)
                    memory.selectCheckpoint(obs.source_checkpoint_id)
                  }}
                  calibrationCaptures={live ? [] : calibrationCaptures}
                  nearAnchorId={nearAnchor?.id ?? null}
                />
              </div>
              <aside className="rounded-xl border border-line bg-panel/70 p-3 text-xs text-soft">
                <p className="font-semibold text-bright">Legend</p>
                <ul className="mt-2 space-y-1.5 text-muted">
                  <li>
                    <span className="text-hazard">●</span> Start / seed
                  </li>
                  <li>
                    <span className="text-signal">●</span> Selected checkpoint
                  </li>
                  <li>
                    <span className="text-danger">●</span> Unsuitable recovery anchor
                  </li>
                  <li>
                    <span className="text-aurora">●</span> Cal view (optional label · not measured)
                  </li>
                  <li>
                    <span className="text-hazard">○</span> Trail break after restore
                  </li>
                  <li>Arrow — estimated heading</li>
                  <li>Ring — pose uncertainty</li>
                  {showObstacles && (
                    <li className="text-[10px]">
                      Obstacles: screen-plane MOCK suggestions — not collision
                    </li>
                  )}
                </ul>
              </aside>
            </div>

            <CheckpointPreview
              checkpoint={selected}
              linkedObstacle={selectedObstacle}
              enhancementSupported={memory.session.enhancementSupported}
              onRestore={(id) => void memory.restoreCheckpoint(id)}
              restoring={restoring}
            />

            <MemoryGallery
              checkpoints={memory.session.checkpoints}
              calibrationCaptures={calibrationCaptures}
              selectedCheckpointId={memory.session.selectedCheckpointId}
              onSelectCheckpoint={(id) => {
                setSelectedObstacle(null)
                memory.selectCheckpoint(id)
              }}
              filter={galleryFilter}
              onFilterChange={setGalleryFilter}
            />

            <HuggingFaceAttribution compact />
          </div>
        </section>
      </div>
    </div>
  )
}
