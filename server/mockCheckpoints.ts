/**
 * MOCK checkpoint store mirroring spatial-memory REST shapes.
 * Images are MockWaypointEngine JPEGs — never claim live_waypoint.
 * Label strings are descriptive only (not measured headings).
 */

import { createHash, randomBytes } from 'node:crypto'
import type { WorldSession } from './worldSessions.ts'
import {
  getSession,
  renderSessionJpeg,
  type SessionFrameSnapshot,
} from './worldSessions.ts'

export interface MockNavigation {
  x: number
  z: number
  yaw: number
  pitch: number
  units: 'estimated_units'
  confidence: number
  cumulative_movement: number
  segment_id: string
  relationship: 'new_unknown' | 'estimated_continuous' | 'restored_view'
  control_seq: number
  epoch: number
  server_elapsed_ms: number
}

export interface MockCheckpoint {
  checkpoint_id: string
  world_id: string
  session_id: string
  epoch: number
  prompt: string
  frame_id: number | null
  control_seq: number
  created_at: string
  provenance: 'initial_seed' | 'raw_video_frame'
  label: string
  navigation: MockNavigation
  quality: {
    status: string
    reviewed: boolean
    approved: boolean
    indicators: Record<string, number>
  }
  image_url: string
  enhanced_image_url: null
  enhancement_status: 'none'
  image_sha256: string
  /** Raw JPEG bytes — review must never mutate. */
  rawJpeg: Buffer
}

interface MockWorldMemory {
  world_id: string
  session_id: string
  prompt: string
  created_at: string
  segment_id: string
  checkpoints: MockCheckpoint[]
}

const worlds = new Map<string, MockWorldMemory>()

function hexId(): string {
  return randomBytes(16).toString('hex')
}

function nowIso(): string {
  return new Date().toISOString()
}

function navigationFromSession(
  s: WorldSession,
  segmentId: string,
  relationship: MockNavigation['relationship'],
): MockNavigation {
  return {
    x: s.view.x,
    z: s.view.z,
    yaw: s.view.yaw,
    pitch: s.view.pitch,
    units: 'estimated_units',
    confidence: 0.85,
    cumulative_movement: Math.hypot(s.view.x, s.view.z),
    segment_id: segmentId,
    relationship,
    control_seq: s.sequence,
    epoch: s.epoch,
    server_elapsed_ms: Date.now() - s.createdAt,
  }
}

export function ensureWorldMemory(session: WorldSession): MockWorldMemory {
  let world = worlds.get(session.id)
  if (world) return world
  const worldId = hexId()
  const segmentId = hexId()
  world = {
    world_id: worldId,
    session_id: session.id,
    prompt: session.prompt,
    created_at: nowIso(),
    segment_id: segmentId,
    checkpoints: [],
  }
  worlds.set(session.id, world)

  // Initial seed checkpoint (mirrors Memory.begin).
  const snap = renderSessionJpeg(session.id)
  if (snap) {
    appendCheckpoint(world, session, snap, 'Initial seed', 'initial_seed')
  }
  return world
}

function appendCheckpoint(
  world: MockWorldMemory,
  session: WorldSession,
  snap: SessionFrameSnapshot,
  label: string,
  provenance: 'initial_seed' | 'raw_video_frame',
): MockCheckpoint {
  if (world.checkpoints.length >= 32) {
    throw Object.assign(new Error('Checkpoint quota32 reached'), { status: 507 })
  }
  const cid = hexId()
  const sha = createHash('sha256').update(snap.jpeg).digest('hex')
  const cp: MockCheckpoint = {
    checkpoint_id: cid,
    world_id: world.world_id,
    session_id: world.session_id,
    epoch: snap.epoch,
    prompt: world.prompt,
    frame_id: snap.frameId,
    control_seq: snap.seq,
    created_at: nowIso(),
    provenance,
    label: label.slice(0, 100),
    navigation: navigationFromSession(
      session,
      world.segment_id,
      provenance === 'initial_seed' ? 'new_unknown' : 'estimated_continuous',
    ),
    quality: {
      status: 'candidate_unreviewed',
      reviewed: false,
      approved: false,
      indicators: { mock: 1, luma_std: 42 },
    },
    image_url: `/world/checkpoints/${cid}/image?session_id=${world.session_id}&variant=raw`,
    enhanced_image_url: null,
    enhancement_status: 'none',
    image_sha256: sha,
    rawJpeg: Buffer.from(snap.jpeg),
  }
  world.checkpoints.push(cp)
  return cp
}

function publicCheckpoint(cp: MockCheckpoint): Omit<MockCheckpoint, 'rawJpeg'> {
  const { rawJpeg: _raw, ...rest } = cp
  return rest
}

export function listCheckpoints(sessionId: string) {
  const session = getSession(sessionId)
  if (!session) return null
  const world = ensureWorldMemory(session)
  return {
    world_id: world.world_id,
    session_id: world.session_id,
    checkpoints: world.checkpoints.map(publicCheckpoint),
  }
}

export function saveCheckpoint(sessionId: string, label: string) {
  const session = getSession(sessionId)
  if (!session) return { error: 'session_not_found', status: 404 as const }
  const world = ensureWorldMemory(session)
  const snap = renderSessionJpeg(sessionId)
  if (!snap) return { error: 'No generated frame available', status: 409 as const }
  try {
    const cp = appendCheckpoint(
      world,
      session,
      snap,
      label || 'Manual checkpoint',
      'raw_video_frame',
    )
    return { checkpoint: publicCheckpoint(cp), status: 200 as const }
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500
    return { error: err instanceof Error ? err.message : String(err), status: status as 507 }
  }
}

export function getCheckpoint(sessionId: string, checkpointId: string) {
  const session = getSession(sessionId)
  if (!session) return null
  const world = ensureWorldMemory(session)
  const cp = world.checkpoints.find((c) => c.checkpoint_id === checkpointId)
  return cp ? publicCheckpoint(cp) : null
}

export function getCheckpointImage(
  sessionId: string,
  checkpointId: string,
  variant: string,
): Buffer | null | 'missing_variant' {
  if (variant !== 'raw') return 'missing_variant'
  const session = getSession(sessionId)
  if (!session) return null
  const world = worlds.get(sessionId)
  if (!world) return null
  const cp = world.checkpoints.find((c) => c.checkpoint_id === checkpointId)
  return cp ? cp.rawJpeg : null
}

/**
 * Persist review flags only — never rewrite rawJpeg / image_sha256.
 */
export function reviewCheckpoint(
  sessionId: string,
  checkpointId: string,
  approved: boolean,
) {
  const session = getSession(sessionId)
  if (!session) return { error: 'session_not_found', status: 404 as const }
  const world = worlds.get(sessionId)
  if (!world) return { error: 'Unknown memory session', status: 404 as const }
  const cp = world.checkpoints.find((c) => c.checkpoint_id === checkpointId)
  if (!cp) return { error: 'Checkpoint not in current world', status: 404 as const }
  const shaBefore = cp.image_sha256
  const bytesBefore = cp.rawJpeg.length
  cp.quality = {
    ...cp.quality,
    reviewed: true,
    approved,
    status: approved ? 'approved' : 'rejected',
  }
  if (cp.image_sha256 !== shaBefore || cp.rawJpeg.length !== bytesBefore) {
    throw new Error('Review mutated image evidence — invariant broken')
  }
  return { checkpoint: publicCheckpoint(cp), status: 200 as const }
}

/** After /world/reset: new estimated segment; evidence retained. */
export function noteSessionReset(sessionId: string): void {
  const world = worlds.get(sessionId)
  if (!world) return
  world.segment_id = hexId()
}

export function discardWorldMemory(sessionId: string): void {
  worlds.delete(sessionId)
}
