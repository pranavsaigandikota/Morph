import type { Checkpoint, ObstacleObservation } from '../../types/worldMemory'

interface Props {
  checkpoint: Checkpoint | null
  linkedObstacle: ObstacleObservation | null
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

  const showEnhance = enhancementSupported && !!checkpoint.enhancedImageUrl
  const sha =
    linkedObstacle?.source_image_sha256 ??
    checkpoint.obstacleAnalysis?.source_image_sha256 ??
    checkpoint.imageSha256
  const analysis = checkpoint.obstacleAnalysis

  return (
    <div className="rounded-xl border border-line bg-panel/80 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-bright">{checkpoint.name}</h3>
          <p className="text-[10px] text-muted">
            #{checkpoint.index} · {new Date(checkpoint.capturedAtMs).toLocaleTimeString()}
            {checkpoint.pose
              ? ` · approx. nav (${checkpoint.pose.x.toFixed(0)}, ${checkpoint.pose.y.toFixed(0)}) · ${Math.round(checkpoint.pose.headingDeg)}°`
              : ''}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted" title={sha ?? undefined}>
            raw SHA-256:{' '}
            {sha ? `${sha.slice(0, 12)}…${sha.slice(-8)}` : 'unavailable'}
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

      {analysis && (
        <p className="mb-2 text-[10px] text-muted">
          Obstacle analysis: <span className="text-soft">{analysis.status}</span>
          {analysis.latency_ms != null ? ` · ${analysis.latency_ms} ms` : ''}
          {analysis.status === 'disabled' ? ' · none for this view' : ''}
        </p>
      )}

      {linkedObstacle && linkedObstacle.source_checkpoint_id === checkpoint.id && (
        <p className="mb-2 rounded border border-hazard/30 bg-hazard/10 px-2 py-1.5 text-[11px] text-soft">
          Observation <span className="text-bright">{linkedObstacle.label}</span> from this
          checkpoint
          {' · '}
          score {linkedObstacle.detection_score.toFixed(2)}
          {' · '}
          bearing{' '}
          {linkedObstacle.direction.bearing_rad == null
            ? 'n/a (null)'
            : `${((linkedObstacle.direction.bearing_rad * 180) / Math.PI).toFixed(0)}°`}
          {' · '}
          depth{' '}
          {linkedObstacle.relative_depth.value == null
            ? 'n/a'
            : `rank ${linkedObstacle.relative_depth.value} (${linkedObstacle.relative_depth.units})`}
          <span className="mt-0.5 block text-[10px] text-muted">
            Unverified AI suggestion — not collision geometry. Provenance SHA matches original
            image only.
            {checkpoint.source === 'mock' ? ' · MOCK' : ''}
          </span>
        </p>
      )}

      <div className={showEnhance ? 'grid gap-2 sm:grid-cols-2' : ''}>
        <figure>
          <div className="relative aspect-video overflow-hidden rounded-md bg-void">
            <img
              src={checkpoint.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {/* Bboxes only on original — never on enhanced presentation */}
            {linkedObstacle &&
              linkedObstacle.source_checkpoint_id === checkpoint.id && (
                <div
                  className="pointer-events-none absolute border border-hazard/90 bg-hazard/15"
                  style={{
                    left: `${linkedObstacle.bbox_normalized[0] * 100}%`,
                    top: `${linkedObstacle.bbox_normalized[1] * 100}%`,
                    width: `${(linkedObstacle.bbox_normalized[2] - linkedObstacle.bbox_normalized[0]) * 100}%`,
                    height: `${(linkedObstacle.bbox_normalized[3] - linkedObstacle.bbox_normalized[1]) * 100}%`,
                  }}
                />
              )}
          </div>
          <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-muted">
            Original (detection evidence)
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
              AI-enhanced preview — not detection evidence
              {checkpoint.source === 'mock' ? ' (MOCK)' : ''}
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}
