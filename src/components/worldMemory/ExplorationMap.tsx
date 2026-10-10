import { useEffect, useMemo, useRef, useState } from 'react'
import type { Checkpoint, EstimatedPose, TrailPoint } from '../../types/worldMemory'

interface Props {
  pose: EstimatedPose
  trail: TrailPoint[]
  checkpoints: Checkpoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  centerRequest: boolean
  onCenterConsumed: () => void
  showTrail: boolean
  mock: boolean
}

export function ExplorationMap({
  pose,
  trail,
  checkpoints,
  selectedId,
  onSelect,
  centerRequest,
  onCenterConsumed,
  showTrail,
  mock,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState({ x: -180, y: -120, w: 360, h: 240 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  useEffect(() => {
    if (!centerRequest) return
    setView((v) => ({ ...v, x: pose.x - v.w / 2, y: pose.y - v.h / 2 }))
    onCenterConsumed()
  }, [centerRequest, onCenterConsumed, pose.x, pose.y])

  const pathD = useMemo(() => {
    if (!showTrail || trail.length < 2) return ''
    const parts: string[] = []
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i]!
      const cmd = i === 0 || !p.continuous ? 'M' : 'L'
      parts.push(`${cmd}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    }
    return parts.join(' ')
  }, [showTrail, trail])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.12 : 0.9
    setView((v) => {
      const w = Math.min(1200, Math.max(80, v.w * factor))
      const h = w * (v.h / v.w)
      return {
        w,
        h,
        x: pose.x - w / 2,
        y: pose.y - h / 2,
      }
    })
  }

  return (
    <div className="relative h-full min-h-[220px] overflow-hidden rounded-xl border border-line bg-ink">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
        }}
        onPointerMove={(e) => {
          if (!drag.current || !svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const dx = ((e.clientX - drag.current.x) / rect.width) * view.w
          const dy = ((e.clientY - drag.current.y) / rect.height) * view.h
          setView((v) => ({ ...v, x: drag.current!.vx - dx, y: drag.current!.vy - dy }))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <defs>
          <pattern id="wm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#243246" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect x={view.x - 2000} y={view.y - 2000} width={8000} height={8000} fill="url(#wm-grid)" />

        {showTrail && pathD && (
          <path d={pathD} fill="none" stroke="#2ee6d6" strokeOpacity="0.55" strokeWidth="2.2" />
        )}

        {checkpoints.map((cp) => {
          const px = cp.pose?.x ?? 0
          const py = cp.pose?.y ?? 0
          const selected = cp.id === selectedId
          return (
            <g
              key={cp.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(cp.id)
              }}
            >
              <circle
                cx={px}
                cy={py}
                r={selected ? 7 : 5}
                fill={cp.index === 0 ? '#f5a623' : selected ? '#2ee6d6' : '#9aabbe'}
                stroke="#05070a"
                strokeWidth="1.5"
              />
              <text
                x={px + 8}
                y={py - 6}
                fill="#9aabbe"
                fontSize="8"
                style={{ pointerEvents: 'none' }}
              >
                {cp.index === 0 ? 'Start' : cp.index}
              </text>
            </g>
          )
        })}

        {/* Player */}
        <g transform={`translate(${pose.x},${pose.y}) rotate(${pose.headingDeg})`}>
          <circle r="6" fill="#eef3f8" stroke="#2ee6d6" strokeWidth="2" />
          <polygon points="0,-14 5,-2 -5,-2" fill="#2ee6d6" />
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-ink/85 px-2 py-1 text-[10px] uppercase tracking-wider text-muted backdrop-blur">
        Approximate trail{mock ? ' · MOCK' : ''}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-muted">
        ({pose.x.toFixed(0)}, {pose.y.toFixed(0)}) · unc {((pose.uncertainty ?? 0) * 100).toFixed(0)}%
      </div>
    </div>
  )
}
