import clsx from 'clsx'

interface Props {
  headingDeg: number
  uncertainty?: number
  className?: string
  compact?: boolean
}

/** Estimated session heading — not geographic north. */
export function Compass({ headingDeg, uncertainty = 0, className, compact }: Props) {
  const size = compact ? 44 : 64
  return (
    <div
      className={clsx('flex items-center gap-2', className)}
      title="Estimated heading in this session's arbitrary frame — not real-world north"
    >
      <div
        className="relative rounded-full border border-line bg-ink/80 shadow-inner"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 grid place-items-center text-[9px] font-bold text-muted">
          N*
        </div>
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out"
          style={{ transform: `rotate(${headingDeg}deg)` }}
        >
          <div
            className="absolute left-1/2 top-1.5 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[12px] border-x-transparent border-b-signal"
            style={{ filter: uncertainty > 0.6 ? 'opacity(0.55)' : undefined }}
          />
        </div>
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-mono text-sm text-bright">{Math.round(headingDeg)}°</p>
          <p className="text-[10px] uppercase tracking-wider text-muted">Est. heading</p>
        </div>
      )}
    </div>
  )
}
