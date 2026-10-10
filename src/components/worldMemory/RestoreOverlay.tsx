import type { Checkpoint, RestoreJob } from '../../types/worldMemory'

interface Props {
  job: RestoreJob | null
  checkpoint: Checkpoint | null
}

export function RestoreOverlay({ job, checkpoint }: Props) {
  if (!job || job.phase === 'idle' || job.phase === 'complete') return null
  return (
    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-void/55 backdrop-blur-[2px]">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-line bg-panel/95 p-4 shadow-2xl">
        {checkpoint && (
          <img
            src={checkpoint.imageUrl}
            alt=""
            className="mb-3 aspect-video w-full rounded-md object-cover"
          />
        )}
        <p className="font-display text-base font-bold text-bright">Restoring remembered view</p>
        <p className="mt-1 text-xs text-soft">{job.message}</p>
        {job.phase === 'failed' && (
          <p className="mt-2 text-xs text-danger">{job.error ?? 'Restore failed'}</p>
        )}
        {job.phase !== 'failed' && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-signal" />
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted">
          This reinitializes generation from a saved image — continuity is approximate, not physical
          travel.
        </p>
      </div>
    </div>
  )
}
