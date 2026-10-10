/**
 * MOCK obstacle_analysis fixtures shaped like Codex OBSTACLE_SCHEMA_PROPOSAL.
 * LIVE must not call these helpers — missing analysis stays null/empty.
 */
import type {
  Checkpoint,
  ObstacleAnalysis,
  ObstacleObservation,
  ObstacleSuggestionClass,
} from '../../types/worldMemory'

/** Faux SHA-256 for MOCK only — LIVE must use real hash of original bytes. */
export function mockImageSha256(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return (hex.repeat(8) + 'a1b2c3d4').slice(0, 64)
}

export function suggestionClassFromLabel(label: string): ObstacleSuggestionClass {
  const l = label.toLowerCase()
  if (/wall|building|vehicle|debris|tree|barrier/.test(l)) return 'blocked'
  if (/flood|hazard|fire|smoke/.test(l)) return 'hazard'
  if (/path|road|walkway|corridor|clearing/.test(l)) return 'walkable_hint'
  return 'unknown'
}

const LABELS = [
  'wall',
  'building',
  'vehicle',
  'fallen tree',
  'debris',
  'flooded ground',
  'visible pathway',
]

/**
 * Build MOCK obstacle_analysis for a checkpoint.
 * bearing_rad is intentionally null (no verified FOV).
 * relative_depth is within_image_rank — not meters.
 */
export function mockObstacleAnalysisForCheckpoint(cp: Checkpoint): ObstacleAnalysis | null {
  if (cp.index === 0) {
    return {
      status: 'disabled',
      job_id: null,
      model_revisions: {},
      source_image_sha256: cp.imageSha256 ?? mockImageSha256(cp.id),
      latency_ms: null,
      observations: [],
    }
  }
  const sha = cp.imageSha256 ?? mockImageSha256(cp.id)
  const seed = cp.index * 17 + (cp.manual ? 3 : 0)
  const count = 2 + (seed % 3)
  const observations: ObstacleObservation[] = []
  for (let i = 0; i < count; i++) {
    const label = LABELS[(seed + i) % LABELS.length]!
    const x0 = 0.1 + ((seed + i * 3) % 50) / 100
    const y0 = 0.15 + ((seed + i * 5) % 40) / 100
    const x1 = Math.min(0.95, x0 + 0.12 + (i % 3) * 0.05)
    const y1 = Math.min(0.95, y0 + 0.14 + (i % 2) * 0.06)
    const screen_x = (x0 + x1) / 2
    const screen_y = (y0 + y1) / 2
    observations.push({
      observation_id: `mock-obs-${cp.id}-${i}`,
      source_checkpoint_id: cp.id,
      source_image_sha256: sha,
      label,
      bbox_normalized: [x0, y0, x1, y1],
      direction: {
        screen_x,
        screen_y,
        bearing_rad: null,
      },
      relative_depth: {
        value: 1 + ((seed + i) % 8),
        units: 'within_image_rank',
        near_is: 'lower',
        scale_scope: 'checkpoint',
        confidence: null,
      },
      estimated_navigation: cp.pose
        ? {
            x: cp.pose.x,
            z: cp.pose.y,
            yaw: (cp.pose.headingDeg * Math.PI) / 180,
            pitch: 0,
            segment_id: null,
            confidence: 0.35,
          }
        : null,
      estimated_position: null,
      detection_score: 0.4 + ((seed + i) % 5) * 0.1,
      review_status: 'unreviewed',
      limitations: [
        'MOCK observation — not live detector output',
        'Not a collision boundary',
        'bearing_rad null without verified FOV',
        'relative_depth is within_image_rank, not meters',
      ],
    })
  }
  return {
    status: 'ready',
    job_id: `mock-job-${cp.id}`,
    model_revisions: {
      depth: 'mock-depth-anything-v2-small',
      detector: 'mock-owl-vit',
    },
    source_image_sha256: sha,
    latency_ms: 120 + (seed % 80),
    observations,
  }
}

/**
 * Place a glyph in a local image-plane sketch around the checkpoint.
 * Uses screen_x/screen_y only — does NOT invent bearing or metric depth.
 */
export function imagePlaneSketchPosition(
  cp: Checkpoint,
  obs: ObstacleObservation,
  ring = 24,
): { x: number; y: number } {
  const ox = cp.pose?.x ?? 0
  const oy = cp.pose?.y ?? 0
  const dx = (obs.direction.screen_x - 0.5) * ring * 2
  const dy = (obs.direction.screen_y - 0.5) * ring * 2
  return { x: ox + dx, y: oy + dy }
}
