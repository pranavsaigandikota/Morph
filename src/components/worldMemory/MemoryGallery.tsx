import clsx from 'clsx'
import type { CalibrationCapture } from '../../types/calibration'
import { DIRECTION_LABEL } from '../../types/calibration'
import type { Checkpoint } from '../../types/worldMemory'
import { loadApprovedStarters } from '../../services/hqStarterCandidates'

export type GalleryFilter =
  | 'all'
  | 'calibration'
  | 'checkpoints'
  | 'approved_anchors'
  | 'rejected'

interface Props {
  checkpoints: Checkpoint[]
  calibrationCaptures: CalibrationCapture[]
  selectedCheckpointId: string | null
  onSelectCheckpoint: (id: string) => void
  filter?: GalleryFilter
  onFilterChange?: (f: GalleryFilter) => void
}

interface GalleryItem {
  id: string
  kind: 'calibration' | 'checkpoint' | 'approved_hq' | 'rejected'
  title: string
  imageUrl: string
  capturedAtMs: number
  directionLabel?: string
  rawVsEnhanced: 'raw' | 'enhanced' | 'mock_ui' | 'hq_starter'
  reviewStatus: string
  confidence: number | null
  unsuitable?: boolean
  checkpointId?: string
}

export function MemoryGallery({
  checkpoints,
  calibrationCaptures,
  selectedCheckpointId,
  onSelectCheckpoint,
  filter = 'all',
  onFilterChange,
}: Props) {
  const approved = loadApprovedStarters()

  const items: GalleryItem[] = []

  for (const c of calibrationCaptures) {
    items.push({
      id: c.id,
      kind: 'calibration',
      title: `Calibration · ${DIRECTION_LABEL[c.suggestedLabel]}`,
      imageUrl: c.imageUrl,
      capturedAtMs: c.capturedAtMs,
      directionLabel: `${DIRECTION_LABEL[c.suggestedLabel]} (optional)`,
      rawVsEnhanced: c.source === 'live_waypoint' ? 'raw' : 'mock_ui',
      reviewStatus: c.reviewStatus,
      confidence: c.confidence,
    })
  }

  for (const cp of checkpoints) {
    const rejected = cp.recoverySuitable === false
    items.push({
      id: cp.id,
      kind: rejected ? 'rejected' : 'checkpoint',
      title: cp.name,
      imageUrl: cp.imageUrl,
      capturedAtMs: cp.capturedAtMs,
      directionLabel: cp.pose ? `${Math.round(cp.pose.headingDeg)}° est.` : undefined,
      rawVsEnhanced: cp.enhancedImageUrl ? 'raw' : 'raw',
      reviewStatus: rejected ? 'rejected_anchor' : cp.status,
      confidence: cp.pose?.uncertainty ?? null,
      unsuitable: rejected,
      checkpointId: cp.id,
    })
    if (cp.enhancedImageUrl) {
      items.push({
        id: `${cp.id}-enh`,
        kind: 'checkpoint',
        title: `${cp.name} (AI-enhanced)`,
        imageUrl: cp.enhancedImageUrl,
        capturedAtMs: cp.capturedAtMs,
        rawVsEnhanced: 'enhanced',
        reviewStatus: 'enhanced_preview',
        confidence: null,
        checkpointId: cp.id,
      })
    }
  }

  for (const a of approved) {
    items.push({
      id: a.id,
      kind: 'approved_hq',
      title: `Approved HQ · seed ${a.generationSeed}`,
      imageUrl: a.imageUrl,
      capturedAtMs: Date.parse(a.createdAt) || Date.now(),
      rawVsEnhanced: 'hq_starter',
      reviewStatus: a.approval,
      confidence: null,
    })
  }

  const filtered = items.filter((it) => {
    if (filter === 'all') return true
    if (filter === 'calibration') return it.kind === 'calibration'
    if (filter === 'checkpoints') return it.kind === 'checkpoint'
    if (filter === 'approved_anchors') return it.kind === 'approved_hq'
    if (filter === 'rejected') return it.kind === 'rejected' || it.unsuitable
    return true
  })

  const filters: Array<{ id: GalleryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'calibration', label: 'Calibration' },
    { id: 'checkpoints', label: 'Checkpoints' },
    { id: 'approved_anchors', label: 'Approved anchors' },
    { id: 'rejected', label: 'Rejected / degraded' },
  ]

  return (
    <section className="rounded-xl border border-line bg-panel/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold text-bright">Screenshot & memory gallery</h3>
          <p className="text-[10px] text-muted">
            AI-enhanced previews are not verified physical evidence. MOCK calibration stills are
            labeled.
          </p>
        </div>
        {onFilterChange && (
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                className={clsx(
                  'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  filter === f.id
                    ? 'border-signal/50 bg-signal/10 text-signal'
                    : 'border-line text-muted hover:text-bright',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">No items in this filter.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {filtered.map((it) => {
            const selected =
              it.checkpointId != null && it.checkpointId === selectedCheckpointId
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  if (it.checkpointId) onSelectCheckpoint(it.checkpointId)
                }}
                className={clsx(
                  'w-44 shrink-0 overflow-hidden rounded-lg border text-left transition',
                  selected
                    ? 'border-signal bg-elevated'
                    : it.unsuitable
                      ? 'border-danger/40 bg-ink opacity-90'
                      : 'border-line bg-ink hover:border-signal/40',
                )}
              >
                <div className="relative aspect-video bg-void">
                  <img
                    src={it.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <span className="absolute left-1.5 top-1.5 rounded bg-void/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-soft">
                    {it.kind.replace('_', ' ')}
                  </span>
                </div>
                <div className="space-y-0.5 p-2 text-[10px]">
                  <p className="truncate font-semibold text-bright">{it.title}</p>
                  <p className="text-muted">
                    {new Date(it.capturedAtMs).toLocaleTimeString()}
                    {it.directionLabel ? ` · ${it.directionLabel}` : ''}
                  </p>
                  <p className="uppercase tracking-wider text-muted">
                    {it.rawVsEnhanced === 'enhanced'
                      ? 'AI-enhanced preview'
                      : it.rawVsEnhanced === 'mock_ui'
                        ? 'MOCK UI still'
                        : it.rawVsEnhanced === 'hq_starter'
                          ? 'Approved HQ SDXL'
                          : 'Original / raw'}
                  </p>
                  <p className="text-muted">
                    Status: {it.reviewStatus}
                    {it.confidence != null ? ` · conf ${it.confidence.toFixed(2)}` : ''}
                  </p>
                  {it.unsuitable && (
                    <p className="font-semibold text-danger">Not a recovery anchor</p>
                  )}
                  {it.rawVsEnhanced === 'enhanced' && (
                    <p className="text-hazard">Not detection evidence</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
