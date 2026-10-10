import type { Checkpoint, InferredObstacle } from '../../types/worldMemory'
import { obstacleMapPosition } from '../../services/worldMemory/mockObstacles'

const KIND_STYLE: Record<
  InferredObstacle['kind'],
  { fill: string; stroke: string; dash?: string }
> = {
  blocked: { fill: '#ef444466', stroke: '#ef4444' },
  hazard: { fill: '#f5a62355', stroke: '#f5a623', dash: '4 3' },
  walkable_hint: { fill: '#34d39933', stroke: '#34d399', dash: '2 4' },
}

interface Props {
  checkpoints: Checkpoint[]
  selectedObstacleId: string | null
  onSelectObstacle: (obs: InferredObstacle) => void
}

/**
 * Separate SVG layer for AI-inferred obstacles.
 * Not verified collision geometry — confidence styled via opacity/dash.
 */
export function ObstacleOverlay({
  checkpoints,
  selectedObstacleId,
  onSelectObstacle,
}: Props) {
  return (
    <g data-layer="ai-inferred-obstacles">
      {checkpoints.flatMap((cp) =>
        (cp.obstacles ?? []).map((obs) => {
          const { x, y } = obstacleMapPosition(cp, obs)
          const style = KIND_STYLE[obs.kind]
          const selected = obs.id === selectedObstacleId
          const r = (obs.radius ?? 6) * (selected ? 1.25 : 1)
          const opacity = 0.25 + obs.confidence * 0.7
          return (
            <g
              key={obs.id}
              className="cursor-pointer"
              opacity={opacity}
              onClick={(e) => {
                e.stopPropagation()
                onSelectObstacle(obs)
              }}
            >
              {/* Bearing stub from checkpoint toward obstacle */}
              {cp.pose && (
                <line
                  x1={cp.pose.x}
                  y1={cp.pose.y}
                  x2={x}
                  y2={y}
                  stroke={style.stroke}
                  strokeWidth={selected ? 1.4 : 0.8}
                  strokeDasharray={style.dash ?? '3 3'}
                  opacity={0.5}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={selected ? 2 : 1.2}
                strokeDasharray={style.dash}
              />
              {selected && (
                <text
                  x={x + r + 3}
                  y={y + 3}
                  fill="#eef3f8"
                  fontSize="7"
                  style={{ pointerEvents: 'none' }}
                >
                  {obs.label ?? obs.kind} · {obs.relativeDistance.toFixed(0)}u ·{' '}
                  {Math.round(obs.confidence * 100)}%
                </text>
              )}
            </g>
          )
        }),
      )}
    </g>
  )
}
