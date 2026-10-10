import clsx from 'clsx'
import { useCallback, useEffect, useState, type RefObject } from 'react'
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
  /** Saved / preset worlds — switch without remounting React */
  worlds?: SwitchableWorld[]
  activeSeed?: string | null
  onSwitchWorld?: (seed: string | null) => void
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
  worlds,
  activeSeed,
  onSwitchWorld,
}: Props) {
  const [helpOpen, setHelpOpen] = useState(true)
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
        fullscreen ? 'h-screen' : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 cursor-crosshair overflow-hidden bg-ink"
        onClick={() => {
          if (live && !pointerLocked) onRequestLock()
        }}
      >
        <canvas
          ref={canvasElRef}
          className="h-full w-full object-contain"
          style={{ imageRendering: 'auto' }}
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
                  <p className="mt-1 text-sm text-muted">WS /stream · binary JPEG envelopes</p>
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

        {phase === 'paused' && (
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
                  <kbd className="text-bright">W A S D</kbd> — move
                </li>
                <li>
                  <kbd className="text-bright">Mouse</kbd> — look (pointer lock or drag-look)
                </li>
                <li>
                  <kbd className="text-bright">Esc</kbd> release lock ·{' '}
                  <kbd className="text-bright">F</kbd> fullscreen ·{' '}
                  <kbd className="text-bright">H</kbd> help
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                Only controls verified with the Waypoint backend are listed. First-person stream —
                use Rescue Mission for grid navigation.
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
            {meta ? `${meta.inference_ms}ms` : '—'} · tc {meta?.temporal_compression ?? '—'}
          </span>
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
            Reset
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
