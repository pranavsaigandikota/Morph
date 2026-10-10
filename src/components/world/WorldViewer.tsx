import clsx from 'clsx'
import type { RefObject } from 'react'
import type { WorldFrameMeta, WorldMetrics } from '../../types/world'
import { PerformanceOverlay } from './PerformanceOverlay'

interface Props {
  frameUrl: string | null
  meta: WorldFrameMeta | null
  metrics: WorldMetrics | null
  phase: string
  mock: boolean
  error: string | null
  pointerLocked: boolean
  engineName: string | null
  canvasRef: RefObject<HTMLDivElement | null>
  onRequestLock: () => void
  onPause: () => void
  onReset: () => void
  onDisconnect: () => void
  onReconnect: () => void
}

export function WorldViewer({
  frameUrl,
  meta,
  metrics,
  phase,
  mock,
  error,
  pointerLocked,
  engineName,
  canvasRef,
  onRequestLock,
  onPause,
  onReset,
  onDisconnect,
  onReconnect,
}: Props) {
  const live =
    phase === 'streaming' ||
    phase === 'paused' ||
    phase === 'connecting' ||
    phase === 'reconnecting'

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col bg-void">
      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1 cursor-crosshair overflow-hidden bg-ink"
        onClick={() => {
          if (live && !pointerLocked) onRequestLock()
        }}
      >
        {frameUrl ? (
          <img
            src={frameUrl}
            alt="Waypoint world frame"
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="grid h-full place-items-center">
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
              {phase === 'idle' || phase === 'disconnected' ? (
                <p className="text-muted">Select a scene to begin</p>
              ) : null}
            </div>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 3px)',
          }}
        />

        <PerformanceOverlay
          metrics={metrics}
          phase={phase}
          mock={mock}
          engineName={engineName}
        />

        {mock && frameUrl && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-mock px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-void">
            Mock Stream
          </div>
        )}
        {!mock && frameUrl && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-ok px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-void">
            Waypoint Live
          </div>
        )}

        {!pointerLocked && live && frameUrl && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
            <p className="rounded-md border border-line bg-ink/80 px-3 py-1.5 text-sm text-soft backdrop-blur">
              Click to capture mouse · WASD move · Space jump · Esc releases lock
            </p>
          </div>
        )}

        {phase === 'paused' && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-void/40">
            <p className="font-display text-3xl font-bold tracking-wide text-bright">Paused</p>
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">
            {meta ? `${meta.width}×${meta.height}` : '—'} · frame {meta?.frame_id ?? '—'} · gen{' '}
            {meta ? `${meta.inference_ms}ms` : '—'} · tc {meta?.temporal_compression ?? '—'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
  onClick: () => void
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
