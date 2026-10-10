import clsx from 'clsx'

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const

interface Props {
  playing: boolean
  frameIdx: number
  frameCount: number
  speed: number
  disabled?: boolean
  onPlayPause: () => void
  onReset: () => void
  onSpeed: (s: number) => void
  onSeek: (idx: number) => void
}

export function ReplayControls({
  playing,
  frameIdx,
  frameCount,
  speed,
  disabled,
  onPlayPause,
  onReset,
  onSpeed,
  onSeek,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || frameCount < 2}
        onClick={onPlayPause}
        className={clsx(
          'rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40',
          playing
            ? 'border-hazard/50 bg-hazard/15 text-hazard'
            : 'border-line bg-elevated text-bright hover:border-signal/40',
        )}
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        className="rounded-md border border-line bg-elevated px-3 py-1.5 text-sm font-semibold text-bright transition hover:border-signal/40 disabled:opacity-40"
      >
        Reset
      </button>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onSpeed(s)}
            className={clsx(
              'rounded border px-2 py-1 text-xs font-semibold disabled:opacity-40',
              speed === s
                ? 'border-signal bg-signal/15 text-signal'
                : 'border-line text-muted hover:text-bright',
            )}
          >
            {s}×
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, frameCount - 1)}
        value={frameIdx}
        disabled={disabled || frameCount < 1}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="ml-1 min-w-[140px] flex-1 accent-signal"
        aria-label="Replay scrubber"
      />
      <span className="font-mono text-xs text-muted">
        {frameCount ? frameIdx + 1 : 0}/{frameCount}
      </span>
    </div>
  )
}
