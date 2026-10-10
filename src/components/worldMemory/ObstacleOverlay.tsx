import type { Checkpoint, ObstacleObservation } from '../../types/worldMemory'
import {
  imagePlaneSketchPosition,
  suggestionClassFromLabel,
} from '../../services/worldMemory/mockObstacles'

const KIND_STYLE: Record<
  ReturnType<typeof suggestionClassFromLabel>,
  { fill: string; stroke: string; dash?: string }
> = {
  blocked: { fill: '#ef444466', stroke: '#ef4444' },
  hazard: { fill: '#f5a62355', stroke: '#f5a623', dash: '4 3' },
  walkable_hint: { fill: '#34d39933', stroke: '#34d399', dash: '2 4' },
  unknown: { fill: '#9aabbe44', stroke: '#9aabbe', dash: '2 2' },
}

interface Props {
  checkpoints: Checkpoint[]
  selectedObstacleId: string | null
  onSelectObstacle: (obs: ObstacleObservation) => void
}

/**
 * Optional SVG layer for Codex-shaped obstacle observations.
 * Map placement uses image-plane screen offsets — not invented bearings or meters.
 * Suggestion colors are unverified AI hints, not collision geometry.
 */
export function ObstacleOverlay({
  checkpoints,
  selectedObstacleId,
  onSelectObstacle,
}: Props) {
  return (
    <g data-layer="ai-inferred-obstacles">
      {checkpoints.flatMap((cp) => {
        const analysis = cp.obstacleAnalysis
        if (!analysis || analysis.status !== 'ready') return []
        return analysis.observations.map((obs) => {
          const { x, y } = imagePlaneSketchPosition(cp, obs)
          const suggestion = suggestionClassFromLabel(obs.label)
          const style = KIND_STYLE[suggestion]
          const selected = obs.observation_id === selectedObstacleId
          const score = obs.detection_score
          const opacity = 0.3 + Math.min(1, Math.max(0, score)) * 0.65
          const r = selected ? 7 : 5.5
          return (
            <g
              key={obs.observation_id}
              className="cursor-pointer"
              opacity={opacity}
              onClick={(e) => {
                e.stopPropagation()
                onSelectObstacle(obs)
              }}
            >
              {/* Bearing ray only when backend provides bearing_rad — never invent */}
              {obs.direction.bearing_rad != null && cp.pose && (
                <line
                  x1={cp.pose.x}
                  y1={cp.pose.y}
                  x2={
                    cp.pose.x +
                    Math.sin(obs.direction.bearing_rad) * 28
                  }
                  y2={
                    cp.pose.y -
                    Math.cos(obs.direction.bearing_rad) * 28
                  }
                  stroke={style.stroke}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.55}
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
                  {obs.label}
                  {obs.relative_depth.value != null
                    ? ` · depth rank ${obs.relative_depth.value}`
                    : ' · depth n/a'}
                  {` · score ${obs.detection_score.toFixed(2)}`}
                </text>
              )}
            </g>
          )
        })
      })}
    </g>
  )
}
