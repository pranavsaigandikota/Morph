import clsx from 'clsx'
import type { HqStarterCandidate, StarterApproval } from '../../services/hqStarterCandidates'
import { HQ_TARGET } from '../../services/hqStarterCandidates'

interface Props {
  candidates: HqStarterCandidate[]
  errors: Array<{ seed: number; message: string }>
  statusMessage: string
  onApproval: (id: string, approval: StarterApproval) => void
  onExploreApproved: (c: HqStarterCandidate) => void
}

export function StarterContactSheet({
  candidates,
  errors,
  statusMessage,
  onApproval,
  onExploreApproved,
}: Props) {
  const approved = candidates.find((c) => c.approval === 'approved')

  return (
    <section className="mt-8 rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-bright">HQ starter contact sheet</h2>
          <p className="mt-1 max-w-2xl text-sm text-soft">
            Target {HQ_TARGET.width}×{HQ_TARGET.height}, ~{HQ_TARGET.steps} steps, first-person.
            Approve one semantically coherent starter before Waypoint. Blurry or blob-like frames are
            not recovery anchors.
          </p>
        </div>
        {approved && (
          <button
            type="button"
            onClick={() => onExploreApproved(approved)}
            className="rounded-xl border border-ok/40 bg-ok/15 px-4 py-2 text-sm font-bold text-ok"
          >
            Calibrate & explore approved starter
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">{statusMessage}</p>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-soft">
          {errors.map((e) => (
            <li key={e.seed}>
              Seed {e.seed}: {e.message}
            </li>
          ))}
        </ul>
      )}

      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No candidates yet. Run “Generate HQ candidates” on a machine with the experimental SDXL
          HIGH API (Windows GPU). Cloud cannot invent SDXL images.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <article
              key={c.id}
              className={clsx(
                'overflow-hidden rounded-lg border bg-ink',
                c.approval === 'approved'
                  ? 'border-ok/60'
                  : c.approval === 'rejected'
                    ? 'border-danger/40 opacity-70'
                    : 'border-line',
              )}
            >
              <img src={c.imageUrl} alt="" className="aspect-video w-full object-cover" />
              <div className="space-y-1.5 p-3 text-xs">
                <p className="font-mono text-soft">
                  seed {c.generationSeed} · {c.width}×{c.height} · {c.steps} steps · {c.quality}
                </p>
                <p className="truncate font-mono text-[10px] text-muted" title={c.imageSha256 ?? ''}>
                  SHA-256:{' '}
                  {c.imageSha256
                    ? `${c.imageSha256.slice(0, 12)}…${c.imageSha256.slice(-8)}`
                    : 'pending / unavailable'}
                </p>
                {c.model && (
                  <p className="truncate text-[10px] text-muted">
                    {c.model}
                    {c.revision ? ` @ ${c.revision.slice(0, 12)}` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    className="rounded border border-ok/40 bg-ok/10 px-2 py-1 font-semibold text-ok"
                    onClick={() => onApproval(c.id, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded border border-danger/40 bg-danger/10 px-2 py-1 font-semibold text-danger"
                    onClick={() => onApproval(c.id, 'rejected')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 text-muted"
                    onClick={() => onApproval(c.id, 'pending')}
                  >
                    Clear
                  </button>
                </div>
                {c.approval === 'approved' && (
                  <p className="text-[10px] text-ok">Approved starter — safe to enter Waypoint</p>
                )}
                {c.approval === 'rejected' && (
                  <p className="text-[10px] text-danger">Rejected — not a recovery anchor</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-4 rounded-md border border-hazard/30 bg-hazard/10 px-3 py-2 text-[11px] text-soft">
        Policy: early / blurry Waypoint checkpoints are <strong className="text-bright">unsuitable</strong>{' '}
        as recovery anchors. Prefer a new clean theme-consistent SDXL image via verified scene-start
        or restoration — never claim physical continuity across regenerations.
      </p>
    </section>
  )
}
