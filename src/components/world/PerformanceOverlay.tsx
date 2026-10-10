import type { WorldMetrics } from '../../types/world'

interface Props {
  metrics: WorldMetrics | null
  phase: string
  mock: boolean
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] leading-5">
      <span className="text-muted uppercase tracking-wider">{label}</span>
      <span className={warn ? 'text-hazard' : 'text-bright'}>{value}</span>
    </div>
  )
}

export function PerformanceOverlay({ metrics, phase, mock }: Props) {
  const status = metrics?.connection_status ?? phase
  const connected = status === 'connected' || phase === 'streaming' || phase === 'paused'

  return (
    <aside className="pointer-events-none absolute left-3 top-3 z-20 w-[220px] rounded-lg border border-line bg-ink/80 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-xs font-bold tracking-wide text-soft">Telemetry</span>
        {mock && (
          <span className="rounded bg-mock/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
            Mock
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <Row
          label="Status"
          value={String(status)}
          warn={!connected && status !== 'connecting'}
        />
        <Row label="Gen FPS" value={metrics ? metrics.generated_fps.toFixed(1) : '—'} />
        <Row label="Disp FPS" value={metrics ? metrics.displayed_fps.toFixed(1) : '—'} />
        <Row
          label="Latency"
          value={metrics ? `${Math.round(metrics.latency_ms)} ms` : '—'}
          warn={!!metrics && metrics.latency_ms > 120}
        />
        <Row label="Dropped" value={metrics ? String(metrics.dropped_frames) : '—'} />
        <Row
          label="GPU Mem"
          value={metrics ? `${metrics.gpu_memory_mb} MB` : '—'}
        />
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
          {connected ? 'Live stream' : String(status)}
        </span>
      </div>
    </aside>
  )
}
