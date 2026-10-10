import type { Checkpoint, RestoreJob } from '../../types/worldMemory'

interface Props {
  job: RestoreJob | null
  checkpoint: Checkpoint | null
  /** Optional full-world refresh (same session reset) — not a new API. */
  refreshMode?: boolean
}

export function RestoreOverlay({ job, checkpoint, refreshMode = false }: Props) {
  if (!job || job.phase === 'idle' || job.phase === 'complete') return null

  const title = refreshMode
    ? 'Refreshing world'
    : job.phase === 'failed'
      ? 'Recovery failed'
      : 'Restoring viewpoint'

  return (
    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center">
      <div
        className="absolute inset-0 bg-void/60 backdrop-blur-[3px] transition-opacity duration-500"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(46,230,214,0.18), transparent 55%)',
        }}
        aria-hidden
      />
      <div className="pointer-events-auto relative z-10 w-[min(92vw,26rem)] animate-fade-up rounded-2xl border border-line bg-panel/95 p-5 shadow-2xl">
        {checkpoint && (
          <div className="relative mb-3 overflow-hidden rounded-lg">
            <img
              src={checkpoint.imageUrl}
              alt=""
              className="aspect-video w-full object-cover opacity-90"
            />
            <span className="absolute left-2 top-2 rounded bg-void/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-soft">
              {refreshMode ? 'Scene refresh' : 'Remembered view'}
            </span>
          </div>
        )}
        <p className="font-display text-lg font-bold text-bright">{title}</p>
        <p className="mt-1 text-sm text-soft">{job.message}</p>
        {job.phase === 'failed' && (
          <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
            {job.error ?? 'Restore failed'}
          </p>
        )}
        {job.phase !== 'failed' && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted">
              <span>{job.phase.replaceAll('_', ' ')}</span>
              <span>in progress</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-signal to-aurora" />
            </div>
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          A new scene or viewpoint may appear. Continuity is approximate — not physical travel.
          MOCK frames are never substituted silently for LIVE streams.
        </p>
      </div>
    </div>
  )
}
