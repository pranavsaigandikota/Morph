import type { Checkpoint, InferredObstacle } from '../../types/worldMemory'

interface Props {
  checkpoint: Checkpoint | null
  linkedObstacle: InferredObstacle | null
  enhancementSupported: boolean
  onRestore: (id: string) => void
  restoring: boolean
}

export function CheckpointPreview({
  checkpoint,
  linkedObstacle,
  enhancementSupported,
  onRestore,
  restoring,
}: Props) {
  if (!checkpoint) {
    return (
      <div className="rounded-xl border border-line bg-panel/70 p-4 text-xs text-muted">
        Select a remembered view or inferred obstacle to inspect its source screenshot.
      </div>
    )
  }

  const showEnhance =
    enhancementSupported && !!checkpoint.enhancedImageUrl

  return (
    <div className="rounded-xl border border-line bg-panel/80 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold text-bright">{checkpoint.name}</h3>
          <p className="text-[10px] text-muted">
            #{checkpoint.index} · {new Date(checkpoint.capturedAtMs).toLocaleTimeString()}
            {checkpoint.pose
              ? ` · est. ${Math.round(checkpoint.pose.headingDeg)}° @ (${checkpoint.pose.x.toFixed(0)}, ${checkpoint.pose.y.toFixed(0)})`
              : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={!checkpoint.restorable || restoring}
          onClick={() => onRestore(checkpoint.id)}
          className="shrink-0 rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1 text-[11px] font-semibold text-signal disabled:opacity-40"
        >
          Restore viewpoint
        </button>
      </div>

      {linkedObstacle && linkedObstacle.checkpointId === checkpoint.id && (
        <p className="mb-2 rounded border border-hazard/30 bg-hazard/10 px-2 py-1.5 text-[11px] text-soft">
          Inferred obstacle from this screenshot:{' '}
          <span className="text-bright">{linkedObstacle.label ?? linkedObstacle.kind}</span>
          {' · '}
          bearing {Math.round(linkedObstacle.directionDeg)}° · ~{linkedObstacle.relativeDistance.toFixed(0)}{' '}
          units · {Math.round(linkedObstacle.confidence * 100)}% confidence
          <span className="mt-0.5 block text-[10px] text-muted">
            Not verified geometry or a guaranteed collision boundary
            {linkedObstacle.source === 'mock' ? ' · MOCK overlay' : ''}.
          </span>
        </p>
      )}

      <div className={showEnhance ? 'grid gap-2 sm:grid-cols-2' : ''}>
        <figure>
          <img
            src={checkpoint.imageUrl}
            alt=""
            className="aspect-video w-full rounded-md object-cover"
          />
          <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-muted">
            Original
          </figcaption>
        </figure>
        {showEnhance && (
          <figure>
            <img
              src={checkpoint.enhancedImageUrl!}
              alt=""
              className="aspect-video w-full rounded-md object-cover"
            />
            <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-signal">
              AI-enhanced candidate
              {checkpoint.source === 'mock' ? ' (MOCK)' : ''}
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}
