import clsx from 'clsx'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { preferredDisplaySize } from '../../lib/framePresent'

/** Product viewport: native 1280×720 @ 1× (responsive shrink allowed). */
const CLEAR_VIEW = preferredDisplaySize(1)
import {
  DEFAULT_LOOK_SENSITIVITY,
  LOOK_SENS_MAX,
  LOOK_SENS_MIN,
} from '../../lib/lookControl'
import {
  STABILITY_LOOK_YAW_RESTORE,
  WALK_BUDGET_PRESETS_MS,
  type WalkBudgetMs,
} from '../../lib/stabilityMode'
import type { WorldFrameMeta, WorldMetrics } from '../../types/world'
import { PerformanceOverlay } from './PerformanceOverlay'

export interface SwitchableWorld {
  id: string
  label: string
  seed: string | null
  mock?: boolean
}

interface Props {
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
  walkBudgetMs?: WalkBudgetMs
  onWalkBudgetMs?: (ms: WalkBudgetMs) => void
  /** Saved / preset worlds — switch without remounting React */
  worlds?: SwitchableWorld[]
  activeSeed?: string | null
  onSwitchWorld?: (seed: string | null) => void
  /** When true, video sits in a page shell (map below) instead of filling the viewport. */
  embedded?: boolean
}

export function WorldViewer({
  hasFrame,
  meta,
  metrics,
  phase,
  mock,
  error,
  pointerLocked,
  engineName,
  stageRef,
  canvasElRef,
  onRequestLock,
  onPause,
  onReset,
  onDisconnect,
  onReconnect,
  lookRisk = 'ok',
  lookSensitivity = DEFAULT_LOOK_SENSITIVITY,
  onLookSensitivity,
  lastSentMouse,
  idleHolding = false,
  stabilityMode = true,
  onStabilityMode,
  stabilityNotice = null,
  walkBudgetMs = 22_000,
  onWalkBudgetMs,
  worlds,
  activeSeed,
  onSwitchWorld,
  embedded = false,
}: Props) {
  const [helpOpen, setHelpOpen] = useState(!embedded)
  const [fullscreen, setFullscreen] = useState(false)

  const live =
    phase === 'streaming' ||
    phase === 'paused' ||
    phase === 'connecting' ||
    phase === 'reconnecting'

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      // ignore
    }
  }, [stageRef])

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        setHelpOpen((v) => !v)
      }
      if (e.key === 'f' || e.key === 'F') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        void toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  return (
    <div
      className={clsx(
        'relative flex flex-col bg-void',
        fullscreen
          ? 'h-screen'
          : embedded
            ? 'h-[min(72vh,720px)]'
            : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 cursor-crosshair items-center justify-center overflow-hidden bg-ink"
        onClick={() => {
          if (live && !pointerLocked) onRequestLock()
        }}
      >
        {/* Product native 1280×720 @ 1× — responsive shrink only; no 360p mode. */}
        <canvas
          ref={canvasElRef}
          className="rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          style={{
            imageRendering: 'auto',
            width: `min(100%, ${CLEAR_VIEW.width}px)`,
            height: 'auto',
            aspectRatio: '16 / 9',
            maxWidth: CLEAR_VIEW.width,
            maxHeight: CLEAR_VIEW.height,
          }}
        />

        {!hasFrame && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              {(phase === 'starting' ||
                phase === 'connecting' ||
                phase === 'reconnecting') && (
                <>
                  <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-signal/30 border-t-signal animate-spin-ring" />
                  <p className="font-display text-lg text-bright">
                    {phase === 'reconnecting'
                      ? 'Reconnecting to Waypoint…'
                      : 'Connecting to Waypoint engine…'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    WS /world/stream · product native 1280×720
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <PerformanceOverlay
          metrics={metrics}
          phase={phase}
          mock={mock}
          engineName={engineName}
          frameWidth={meta?.width}
          frameHeight={meta?.height}
        />

        {mock && hasFrame && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-mock px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-void">
            Mock Stream
          </div>
        )}
        {!mock && hasFrame && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-ok px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-void">
            Waypoint Live
          </div>
        )}

        {!pointerLocked && live && hasFrame && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
            <p className="rounded-md border border-line bg-ink/80 px-3 py-1.5 text-sm text-soft backdrop-blur">
              Click for pointer lock · or drag to look · H help · F fullscreen
            </p>
          </div>
        )}

        {stabilityNotice && (
          <div className="pointer-events-none absolute bottom-20 right-3 z-40 max-w-xs">
            <div className="rounded-md border border-ok/40 bg-ink/90 px-3 py-2 text-xs text-bright shadow-lg backdrop-blur">
              <p className="font-semibold text-ok">Scene kept clean</p>
              <p className="mt-0.5 text-[11px] leading-snug text-soft">{stabilityNotice}</p>
            </div>
          </div>
        )}

        {!stabilityNotice && lookRisk !== 'ok' && live && hasFrame && !stabilityMode && (
          <div className="absolute inset-x-0 top-14 z-30 mx-auto flex max-w-lg justify-center px-4">
            <div
              className={clsx(
                'rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur',
                lookRisk === 'high'
                  ? 'border-danger/50 bg-danger/15 text-bright'
                  : 'border-hazard/40 bg-hazard/10 text-bright',
              )}
            >
              <p className="font-semibold">
                {lookRisk === 'high'
                  ? 'Look drift likely — scene may look broken'
                  : 'Large camera turn — prefer slow look'}
              </p>
              <p className="mt-1 text-xs text-soft">
                Turn on Stability Mode for automatic seed restore with a notice, or click Restore
                Scene now.
              </p>
              <button
                type="button"
                className="pointer-events-auto mt-2 rounded-md border border-line bg-elevated px-3 py-1 text-xs font-semibold text-signal hover:border-signal/50"
                onClick={(e) => {
                  e.stopPropagation()
                  onReset()
                }}
              >
                Restore Scene
              </button>
            </div>
          </div>
        )}

        {phase === 'paused' && idleHolding && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center">
            <p className="rounded-md border border-line bg-ink/85 px-3 py-1.5 text-sm text-soft backdrop-blur">
              Idle — world held. WASD or drag to continue.
            </p>
          </div>
        )}
        {phase === 'paused' && !idleHolding && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-void/40">
            <p className="font-display text-3xl font-bold tracking-wide text-bright">Paused</p>
          </div>
        )}

        {helpOpen && (
          <div className="absolute inset-x-0 bottom-20 z-30 mx-auto max-w-md px-4">
            <div className="rounded-lg border border-line bg-ink/95 p-4 text-sm shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-display font-bold text-signal">Controls</h3>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-bright"
                  onClick={(e) => {
                    e.stopPropagation()
                    setHelpOpen(false)
                  }}
                >
                  Close (H)
                </button>
              </div>
              <ul className="space-y-1 text-soft">
                <li>
                  <kbd className="text-bright">W A S D</kbd> — move (continuous while held)
                </li>
                <li>
                  <kbd className="text-bright">Mouse</kbd> — look via pointer lock or hold-left
                  drag on the video
                </li>
                <li>
                  <kbd className="text-bright">Esc</kbd> release lock ·{' '}
                  <kbd className="text-bright">F</kbd> fullscreen ·{' '}
                  <kbd className="text-bright">H</kbd> help
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                Verified Explorer controls only. With <span className="text-bright">Stability</span>{' '}
                on (default), walk/look are slowed and the seed auto-restores with a visible notice
                before the image typically melts — that is how the world stays clean on Waypoint.
                Filters cannot invent persistent geometry.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 bottom-20 z-30 mx-auto max-w-lg px-4">
            <div className="rounded-lg border border-danger/50 bg-danger/15 px-4 py-3 text-sm text-bright">
              {error}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">
            {meta ? `${meta.width}×${meta.height}` : '—'} · frame {meta?.frame_id ?? '—'} · gen{' '}
            {meta ? `${meta.inference_ms}ms` : '—'} · look{' '}
            {lastSentMouse
              ? `${lastSentMouse.dx.toFixed(1)},${lastSentMouse.dy.toFixed(1)}`
              : '—'}
          </span>
          {onLookSensitivity && (
            <label
              className="flex items-center gap-2 text-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted">
                Look
              </span>
              <input
                type="range"
                min={LOOK_SENS_MIN}
                max={LOOK_SENS_MAX}
                step={0.05}
                value={lookSensitivity}
                onChange={(e) => onLookSensitivity(Number(e.target.value))}
                className="w-24 accent-[var(--color-signal,#5eead4)]"
              />
              <span className="font-mono text-[10px] text-muted">
                {lookSensitivity.toFixed(2)}
              </span>
            </label>
          )}
          {onStabilityMode && (
            <label
              className="flex items-center gap-1.5 text-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={stabilityMode}
                onChange={(e) => onStabilityMode(e.target.checked)}
                className="accent-[var(--color-signal,#5eead4)]"
              />
              <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted">
                Stability
              </span>
            </label>
          )}
          {stabilityMode && onWalkBudgetMs && (
            <label
              className="flex items-center gap-1.5 text-soft"
              onClick={(e) => e.stopPropagation()}
              title={`Look auto-restore at Σ|dx|≥${STABILITY_LOOK_YAW_RESTORE}`}
            >
              <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted">
                Walk auto
              </span>
              <select
                className="rounded border border-line bg-ink px-1.5 py-0.5 text-[11px] text-bright"
                value={walkBudgetMs}
                onChange={(e) => onWalkBudgetMs(Number(e.target.value) as WalkBudgetMs)}
              >
                {WALK_BUDGET_PRESETS_MS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms === 0 ? 'Off (manual)' : `${ms / 1000}s`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {worlds && worlds.length > 0 && onSwitchWorld && (
            <label className="flex items-center gap-2 text-soft">
              <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted">
                World
              </span>
              <select
                className="max-w-[220px] rounded-md border border-line bg-ink px-2 py-1 text-xs text-bright outline-none focus:border-signal"
                value={activeSeed ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  const v = e.target.value
                  onSwitchWorld(v.length ? v : null)
                }}
              >
                {worlds.map((w) => (
                  <option key={w.id} value={w.seed ?? ''}>
                    {w.label}
                    {w.mock ? ' (MOCK)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ControlButton
            onClick={(e) => {
              e.stopPropagation()
              setHelpOpen((v) => !v)
            }}
          >
            Help
          </ControlButton>
          <ControlButton
            onClick={(e) => {
              e.stopPropagation()
              void toggleFullscreen()
            }}
          >
            {fullscreen ? 'Exit full' : 'Fullscreen'}
          </ControlButton>
          <ControlButton onClick={onPause} disabled={!live} active={phase === 'paused'}>
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </ControlButton>
          <ControlButton onClick={onReset} disabled={!live && phase !== 'error'}>
            Restore Scene
          </ControlButton>
          <ControlButton onClick={onReconnect} disabled={phase === 'idle'}>
            Reconnect
          </ControlButton>
          <ControlButton onClick={onDisconnect} danger>
            Disconnect
          </ControlButton>
        </div>
      </footer>
    </div>
  )
}

function ControlButton({
  children,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'border-danger/40 text-danger hover:bg-danger/10'
          : active
            ? 'border-hazard/50 bg-hazard/15 text-hazard'
            : 'border-line bg-elevated text-bright hover:border-signal/40 hover:text-signal',
      )}
    >
      {children}
    </button>
  )
}
