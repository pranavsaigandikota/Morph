import { useState } from 'react'
import {
  NATIVE_FRAME_H,
  NATIVE_FRAME_W,
  isProductNativeResolution,
} from '../../lib/framePresent'
import type { WorldMetrics } from '../../types/world'

interface Props {
  metrics: WorldMetrics | null
  phase: string
  mock: boolean
  engineName?: string | null
  frameWidth?: number | null
  frameHeight?: number | null
  /** Default collapsed so the world canvas stays the centerpiece. */
  defaultOpen?: boolean
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] leading-5">
      <span className="text-muted uppercase tracking-wider">{label}</span>
      <span className={warn ? 'text-hazard' : 'text-bright'}>{value}</span>
    </div>
  )
}

export function PerformanceOverlay({
  metrics,
  phase,
  mock,
  engineName,
  frameWidth,
  frameHeight,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const status = metrics?.connection_status ?? phase
  const connected = status === 'connected' || phase === 'streaming' || phase === 'paused'
  const w = frameWidth ?? null
  const h = frameHeight ?? null
  const nativeOk =
    w != null && h != null ? isProductNativeResolution(w, h) : null

  return (
    <aside className="pointer-events-auto absolute left-3 top-3 z-20 w-[min(100%-1.5rem,248px)]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-ink/85 px-3 py-2 text-left shadow-xl backdrop-blur-md"
        aria-expanded={open}
      >
        <span className="font-display text-xs font-bold tracking-wide text-soft">
          {open ? 'Hide diagnostics' : 'Diagnostics'}
        </span>
        <span className="flex items-center gap-2">
          {mock ? (
            <span className="rounded bg-mock/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
              Mock
            </span>
          ) : (
            <span className="rounded bg-ok/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
              Live
            </span>
          )}
          <span
            className={`h-2 w-2 rounded-full ${
              connected
                ? 'bg-ok animate-pulse-signal'
                : status === 'reconnecting' || status === 'connecting'
                  ? 'bg-hazard animate-pulse-signal'
                  : 'bg-danger'
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-line bg-ink/90 p-3 shadow-xl backdrop-blur-md">
          <div className="space-y-0.5">
            <Row
              label="Status"
              value={String(status)}
              warn={!connected && status !== 'connecting'}
            />
            <Row
              label="Native"
              value={
                w != null && h != null
                  ? `${w}×${h}`
                  : `${NATIVE_FRAME_W}×${NATIVE_FRAME_H} target`
              }
              warn={nativeOk === false}
            />
            {nativeOk === false && (
              <p className="pb-0.5 text-[10px] leading-snug text-hazard">
                Below product native {NATIVE_FRAME_W}×{NATIVE_FRAME_H} — awaiting Codex validated
                720p contract.
              </p>
            )}
            <Row label="Gen FPS" value={metrics ? metrics.generated_fps.toFixed(1) : '—'} />
            <Row label="Disp FPS" value={metrics ? metrics.displayed_fps.toFixed(1) : '—'} />
            <Row
              label="Latency"
              value={metrics ? `${Math.round(metrics.latency_ms)} ms` : '—'}
              warn={!!metrics && metrics.latency_ms > 300}
            />
            <Row
              label="Gen ms"
              value={
                metrics?.gen_ms_ewma != null ? `${Math.round(metrics.gen_ms_ewma)} ms` : '—'
              }
            />
            <Row
              label="Pres. Skips"
              value={
                metrics
                  ? String(metrics.presentation_skips ?? metrics.dropped_frames ?? 0)
                  : '—'
              }
            />
            <Row
              label="Decode Err"
              value={metrics ? String(metrics.decode_errors ?? 0) : '—'}
              warn={!!metrics && (metrics.decode_errors ?? 0) > 0}
            />
            <Row
              label="Srv Drops"
              value={
                metrics?.server_drops != null ? String(metrics.server_drops) : 'unavailable'
              }
              warn={!!metrics && metrics.server_drops != null && metrics.server_drops > 0}
            />
            <Row
              label="GPU Mem"
              value={
                metrics?.gpu_memory_mb != null
                  ? `${metrics.gpu_memory_mb} MB`
                  : 'unavailable'
              }
              warn={metrics?.gpu_memory_mb == null}
            />
            <p className="pt-0.5 text-[10px] leading-snug text-muted">
              Gen = wire JPEGs · Disp = canvas · FPS claims need Windows GPU measurement
              {metrics?.server_drops == null ? ' · Srv Drops not reported' : ''}
            </p>
            {engineName && <Row label="Engine" value={engineName} />}
          </div>
        </div>
      )}
    </aside>
  )
}
