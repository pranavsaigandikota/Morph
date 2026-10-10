import type { WorldMetrics } from '../../types/world'

interface Props {
  metrics: WorldMetrics | null
  phase: string
  mock: boolean
  engineName?: string | null
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] leading-5">
      <span className="text-muted uppercase tracking-wider">{label}</span>
      <span className={warn ? 'text-hazard' : 'text-bright'}>{value}</span>
    </div>
  )
}

export function PerformanceOverlay({ metrics, phase, mock, engineName }: Props) {
  const status = metrics?.connection_status ?? phase
  const connected = status === 'connected' || phase === 'streaming' || phase === 'paused'

  return (
    <aside className="pointer-events-none absolute left-3 top-3 z-20 w-[248px] rounded-lg border border-line bg-ink/80 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-display text-xs font-bold tracking-wide text-soft">Telemetry</span>
        {mock ? (
          <span className="rounded bg-mock/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
            Mock
          </span>
        ) : (
          <span className="rounded bg-ok/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
            Live
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <Row label="Status" value={String(status)} warn={!connected && status !== 'connecting'} />
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
          Gen = wire JPEGs · Disp = canvas · Pres. Skips = intentional client queue skips (not
          server loss)
          {metrics?.server_drops == null ? ' · Srv Drops not reported by backend' : ''}
        </p>
        {engineName && <Row label="Engine" value={engineName} />}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-line/80 pt-2">
        <span
          className={`h-2 w-2 rounded-full ${
            connected
              ? 'bg-ok animate-pulse-signal'
              : status === 'reconnecting' || status === 'connecting'
                ? 'bg-hazard animate-pulse-signal'
                : 'bg-danger'
          }`}
        />
        <span className="text-[11px] text-muted">
          {connected ? (mock ? 'Mock stream' : 'Waypoint stream') : String(status)}
        </span>
      </div>
    </aside>
  )
}
