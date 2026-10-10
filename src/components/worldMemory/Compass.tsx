import clsx from 'clsx'
import type { ConfidenceBand } from '../../services/worldMemory/liveMapping'

interface Props {
  headingDeg: number
  /** Qualitative band only — never a % ring from data. */
  confidenceBand?: ConfidenceBand
  className?: string
  compact?: boolean
}

/** Estimated session heading — origin is Start, not geographic north. */
export function Compass({ headingDeg, confidenceBand = 'medium', className, compact }: Props) {
  const size = compact ? 44 : 64
  const dim = confidenceBand === 'low'
  return (
    <div
      className={clsx('flex items-center gap-2', className)}
      title="Estimated heading from session Start — not real-world north"
    >
      <div
        className="relative rounded-full border border-line bg-ink/80 shadow-inner"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 grid place-items-center text-[8px] font-bold uppercase tracking-wide text-muted">
          Start
        </div>
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out"
          style={{
            transform: `rotate(${headingDeg}deg)`,
            opacity: dim ? 0.55 : 1,
          }}
        >
          <div className="absolute left-1/2 top-1.5 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[12px] border-x-transparent border-b-signal" />
        </div>
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-mono text-sm text-bright">{Math.round(headingDeg)}°</p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Est. · {confidenceBand} (heuristic)
          </p>
        </div>
      )}
    </div>
  )
}
