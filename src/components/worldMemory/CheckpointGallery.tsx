import clsx from 'clsx'
import type { Checkpoint } from '../../types/worldMemory'

interface Props {
  checkpoints: Checkpoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRestore: (id: string) => void
  restoring: boolean
}

export function CheckpointGallery({
  checkpoints,
  selectedId,
  onSelect,
  onRestore,
  restoring,
}: Props) {
  return (
    <div className="rounded-xl border border-line bg-panel/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-bright">Remembered views</h3>
        <p className="text-[10px] uppercase tracking-wider text-muted">Visual memory</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {checkpoints.map((cp) => {
          const selected = cp.id === selectedId
          return (
            <button
              key={cp.id}
              type="button"
              onClick={() => onSelect(cp.id)}
              className={clsx(
                'w-44 shrink-0 overflow-hidden rounded-lg border text-left transition',
                selected
                  ? 'border-signal bg-elevated'
                  : 'border-line bg-ink hover:border-signal/40',
              )}
            >
              <div className="relative aspect-video bg-void">
                <img
                  src={cp.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-void/70 px-1.5 py-0.5 text-[10px] font-bold text-soft">
                  #{cp.index}
                </span>
              </div>
              <div className="space-y-1 p-2">
                <p className="truncate text-xs font-semibold text-bright">{cp.name}</p>
                <p className="text-[10px] text-muted">
                  {new Date(cp.capturedAtMs).toLocaleTimeString()}
                  {cp.pose ? ` · ${Math.round(cp.pose.headingDeg)}°` : ''}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  {cp.source === 'mock' ? 'MOCK still' : 'Raw'}
                  {cp.manual ? ' · manual' : ' · auto'}
                  {cp.recoverySuitable === false ? ' · unsuitable' : ''}
                </p>
                {cp.recoverySuitable === false && (
                  <p className="text-[10px] font-semibold text-danger">Not a recovery anchor</p>
                )}
                {selected && (
                  <button
                    type="button"
                    disabled={!cp.restorable || cp.recoverySuitable === false || restoring}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRestore(cp.id)
                    }}
                    className="mt-1 w-full rounded border border-signal/40 bg-signal/10 px-2 py-1 text-[11px] font-semibold text-signal disabled:opacity-40"
                  >
                    Restore viewpoint
                  </button>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
