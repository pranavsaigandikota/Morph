/**
 * MOCK AI-inferred obstacles for Explorer map overlay.
 * Separate from trail/nav — not verified geometry or collision bounds.
 */
import type { Checkpoint, InferredObstacle, ObstacleKind } from '../../types/worldMemory'

const KINDS: ObstacleKind[] = ['blocked', 'hazard', 'walkable_hint']

/** Deterministic mock obstacles around a checkpoint pose. */
export function mockObstaclesForCheckpoint(cp: Checkpoint): InferredObstacle[] {
  if (!cp.pose || cp.index === 0) return []
  const seed = cp.index * 17 + (cp.manual ? 3 : 0)
  const count = 2 + (seed % 3)
  const out: InferredObstacle[] = []
  for (let i = 0; i < count; i++) {
    const kind = KINDS[(seed + i) % KINDS.length]!
    const directionDeg = (cp.pose.headingDeg + 40 + i * 55 + seed * 7) % 360
    const relativeDistance = 18 + ((seed * 3 + i * 11) % 28)
    const confidence = kind === 'walkable_hint' ? 0.35 + (i % 3) * 0.1 : 0.45 + (i % 4) * 0.12
    out.push({
      id: `mock-obs-${cp.id}-${i}`,
      checkpointId: cp.id,
      kind,
      directionDeg,
      relativeDistance,
      confidence: Math.min(0.92, confidence),
      radius: kind === 'hazard' ? 7 : kind === 'blocked' ? 6 : 5,
      label:
        kind === 'blocked'
          ? 'Blocked (inferred)'
          : kind === 'hazard'
            ? 'Hazard (inferred)'
            : 'Possibly walkable',
      source: 'mock',
    })
  }
  return out
}

export function obstacleMapPosition(
  cp: Checkpoint,
  obs: InferredObstacle,
): { x: number; y: number } {
  const ox = cp.pose?.x ?? 0
  const oy = cp.pose?.y ?? 0
  const rad = (obs.directionDeg * Math.PI) / 180
  return {
    x: ox + Math.sin(rad) * obs.relativeDistance,
    y: oy - Math.cos(rad) * obs.relativeDistance,
  }
}
