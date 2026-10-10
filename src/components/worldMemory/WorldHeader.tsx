import { Compass } from './Compass'
import type { EstimatedPose, MemorySource } from '../../types/worldMemory'

interface Props {
  worldName: string
  promptSummary: string
  statusLabel: string
  source: MemorySource
  pose: EstimatedPose
  onSaveView: () => void
  onRestoreSelected: () => void
  canRestore: boolean
  saving: boolean
}

export function WorldHeader({
  worldName,
  promptSummary,
  statusLabel,
  source,
  pose,
  onSaveView,
  onRestoreSelected,
  canRestore,
  saving,
}: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel/90 px-4 py-3 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-bright">
            {worldName}
          </h1>
          {source === 'mock' && (
            <span className="rounded bg-mock/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
              Memory MOCK
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-soft">
          {promptSummary || 'Imagine it. Explore it. Remember it.'}
        </p>
        <p className="mt-1 text-[11px] text-muted">{statusLabel}</p>
      </div>
      <Compass headingDeg={pose.headingDeg} uncertainty={pose.uncertainty} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSaveView}
          disabled={saving}
          className="rounded-md border border-line bg-elevated px-3 py-1.5 text-sm font-semibold text-bright hover:border-signal/40 disabled:opacity-40"
        >
          Save View
        </button>
        <button
          type="button"
          onClick={onRestoreSelected}
          disabled={!canRestore}
          className="rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-sm font-semibold text-signal hover:bg-signal/20 disabled:opacity-40"
        >
          Restore viewpoint
        </button>
      </div>
    </header>
  )
}
