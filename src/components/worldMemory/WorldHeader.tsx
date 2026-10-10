import { Compass } from './Compass'
import type { ConfidenceBand } from '../../services/worldMemory/liveMapping'
import type { EstimatedPose, MemorySource } from '../../types/worldMemory'

interface Props {
  worldName: string
  promptSummary: string
  statusLabel: string
  source: MemorySource
  memoryMode?: 'live' | 'mock' | 'unavailable'
  pose: EstimatedPose
  confidenceBand?: ConfidenceBand
  onSaveView: () => void
  onRestoreSelected: () => void
  canRestore: boolean
  saving: boolean
  /** Existing session reset — not a new backend recovery API. */
  onRefreshWorld?: () => void
  refreshDisabled?: boolean
}

export function WorldHeader({
  worldName,
  promptSummary,
  statusLabel,
  source,
  memoryMode,
  pose,
  confidenceBand = 'medium',
  onSaveView,
  onRestoreSelected,
  canRestore,
  saving,
  onRefreshWorld,
  refreshDisabled,
}: Props) {
  const mode = memoryMode ?? (source === 'live' ? 'live' : 'mock')
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel/90 px-4 py-2.5 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-bright">
            {worldName}
          </h1>
          {mode === 'mock' && (
            <span className="rounded bg-mock/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mock">
              Memory MOCK
            </span>
          )}
          {mode === 'live' && (
            <span className="rounded bg-ok/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
              Memory LIVE
            </span>
          )}
          {mode === 'unavailable' && (
            <span className="rounded bg-hazard/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-hazard">
              Memory unavailable
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-soft">
          {promptSummary || 'Imagine it. Explore it. Remember it.'}
        </p>
        <p className="mt-1 text-[11px] text-muted">{statusLabel}</p>
      </div>
      <Compass headingDeg={pose.headingDeg} confidenceBand={confidenceBand} />
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
        {onRefreshWorld && (
          <button
            type="button"
            onClick={onRefreshWorld}
            disabled={refreshDisabled}
            className="rounded-md border border-hazard/40 bg-hazard/10 px-3 py-1.5 text-sm font-semibold text-hazard hover:bg-hazard/20 disabled:opacity-40"
            title="Re-applies the original seed via existing /world/reset — a new viewpoint may appear"
          >
            Refresh World
          </button>
        )}
      </div>
    </header>
  )
}
