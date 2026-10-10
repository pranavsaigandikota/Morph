/**
 * MOCK World Memory API v1.1 routes — same shapes/status codes as live backend.
 * health.mock:true; watermarked JPEG evidence; never claim live_waypoint.
 */

import { createHash, randomBytes } from 'node:crypto'
import { encode as encodeJpeg } from 'jpeg-js'
import type { Express, Request, Response } from 'express'
import {
  getSession,
  type WorldSession,
} from './worldSessions.ts'
import { generateFacilityRgba } from './frameGenerator.ts'

const WIDTH = 1280
const HEIGHT = 720

interface Nav {
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
  anchor_kind: 'world_start' | 'reset_to_seed' | 'checkpoint_restore'
  restored_from_checkpoint_id: string | null
}

interface Cp {
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
  navigation: Nav
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
  capture_reason: 'initial_seed' | 'manual' | 'periodic' | 'calibration'
  calibration: {
    calibration_id: string
    kind: 'capture' | 'return_check'
    soft_label: string
  } | null
  review: { reviewed_at: string | null; reviewer: string | null; reason: string | null }
  rawJpeg: Buffer
}

interface WorldMem {
  world_id: string
  session_id: string
  prompt: string
  created_at: string
  navigation: Nav
  trajectory: Nav[]
  checkpoints: Cp[]
  recovery: { status: string; error: null | string }
  trajectory_absolute: number
}

const worlds = new Map<string, WorldMem>()

function hex(n = 16) {
  return randomBytes(n).toString('hex')
}
function now() {
  return new Date().toISOString()
}

function navFrom(s: WorldSession, segment: string, relationship: Nav['relationship'], anchor: Nav['anchor_kind'], restored: string | null): Nav {
  return {
    x: s.view.x,
    z: s.view.z,
    yaw: s.view.yaw,
    pitch: s.view.pitch,
    units: 'estimated_units',
    confidence: Math.max(0.05, 1 - Math.hypot(s.view.x, s.view.z) * 0.01),
    cumulative_movement: Math.hypot(s.view.x, s.view.z),
    segment_id: segment,
    relationship,
    control_seq: s.sequence,
    epoch: s.epoch,
    server_elapsed_ms: Date.now() - s.createdAt,
    anchor_kind: anchor,
    restored_from_checkpoint_id: restored,
  }
}

function renderJpeg(s: WorldSession, watermark: string): Buffer {
  const rgba = generateFacilityRgba(WIDTH, HEIGHT, s.view, s.frameId)
  // Orange MOCK stripe in top-left via crude pixel overwrite
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < Math.min(WIDTH, 220 + watermark.length * 4); x++) {
      const i = (y * WIDTH + x) * 4
      rgba[i] = 249
      rgba[i + 1] = 115
      rgba[i + 2] = 22
      rgba[i + 3] = 255
    }
  }
  void watermark
  return Buffer.from(encodeJpeg({ data: rgba, width: WIDTH, height: HEIGHT }, 75).data)
}

function publicCp(cp: Cp) {
  const { rawJpeg: _r, ...rest } = cp
  return rest
}

function ensure(sessionId: string): WorldMem | null {
  const s = getSession(sessionId)
  if (!s) return null
  let w = worlds.get(sessionId)
  if (w) return w
  const wid = hex()
  const seg = hex()
  const jpeg = renderJpeg(s, 'MOCK')
  const sha = createHash('sha256').update(jpeg).digest('hex')
  const cid = hex()
  const navigation = navFrom(s, seg, 'new_unknown', 'world_start', null)
  const cp: Cp = {
    checkpoint_id: cid,
    world_id: wid,
    session_id: sessionId,
    epoch: s.epoch,
    prompt: s.prompt,
    frame_id: null,
    control_seq: -1,
    created_at: now(),
    provenance: 'initial_seed',
    label: 'Initial seed',
    navigation,
    quality: {
      status: 'candidate_unreviewed',
      reviewed: false,
      approved: false,
      indicators: { luma_std: 40, laplacian_variance: 900, mock: 1 },
    },
    image_url: `/world/checkpoints/${cid}/image?session_id=${sessionId}&variant=raw`,
    enhanced_image_url: null,
    enhancement_status: 'none',
    image_sha256: sha,
    capture_reason: 'initial_seed',
    calibration: null,
    review: { reviewed_at: null, reviewer: null, reason: null },
    rawJpeg: jpeg,
  }
  w = {
    world_id: wid,
    session_id: sessionId,
    prompt: s.prompt,
    created_at: now(),
    navigation,
    trajectory: [navigation],
    checkpoints: [cp],
    recovery: { status: 'idle', error: null },
    trajectory_absolute: 1,
  }
  worlds.set(sessionId, w)
  return w
}

function syncNav(w: WorldMem, s: WorldSession) {
  const prev = w.navigation.segment_id
  w.navigation = {
    ...navFrom(
      s,
      w.navigation.segment_id,
      'estimated_continuous',
      w.navigation.anchor_kind,
      w.navigation.restored_from_checkpoint_id,
    ),
  }
  // sample trajectory
  if (
    w.trajectory.length === 0 ||
    Math.hypot(w.navigation.x - w.trajectory.at(-1)!.x, w.navigation.z - w.trajectory.at(-1)!.z) >
      0.05
  ) {
    w.trajectory.push({ ...w.navigation })
    w.trajectory_absolute += 1
    if (w.trajectory.length > 2048) w.trajectory.shift()
  }
  void prev
}

const NAV_MODEL = {
  version: 1,
  yaw_rad_per_unit: 0.002,
  units_per_second: 1,
  nominal_fps: 60,
  source: 'nominal_constant',
  turn_gain: 'not_established',
  a0_report: 'experiment/native720-turn-gain-a0',
}

export function noteMockReset(sessionId: string) {
  const s = getSession(sessionId)
  const w = worlds.get(sessionId)
  if (!s || !w) return
  const seg = hex()
  w.navigation = navFrom(s, seg, 'restored_view', 'reset_to_seed', null)
  w.trajectory.push({ ...w.navigation })
  w.trajectory_absolute += 1
}

export function discardMockMemory(sessionId: string) {
  worlds.delete(sessionId)
}

export function attachMockMemoryV11(app: Express) {
  app.get('/world/memory', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const w = ensure(sid)
    const s = getSession(sid)
    if (!w || !s) {
      res.status(404).json({ detail: 'Unknown memory session' })
      return
    }
    syncNav(w, s)
    res.json({
      world_id: w.world_id,
      session_id: w.session_id,
      prompt: w.prompt,
      created_at: w.created_at,
      scene_context: { prompt: w.prompt },
      epoch: s.epoch,
      navigation: w.navigation,
      trajectory: w.trajectory,
      trajectory_offset: Math.max(0, w.trajectory_absolute - w.trajectory.length),
      trajectory_total: w.trajectory_absolute,
      checkpoints: w.checkpoints.map(publicCp),
      recovery: w.recovery,
      limits: {
        checkpoints: 32,
        trajectory_points: 2048,
        disk_mb: 256,
        world_folders: 8,
        checkpoint_seconds: 10,
        nav_event_hz: 2,
      },
      nav_model: NAV_MODEL,
      mock: true,
    })
  })

  app.get('/world/navigation', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const since = Number(req.query.trajectory_since ?? 0)
    const w = ensure(sid)
    const s = getSession(sid)
    if (!w || !s) {
      res.status(404).json({ detail: 'Unknown memory session' })
      return
    }
    syncNav(w, s)
    const offset = Math.max(0, w.trajectory_absolute - w.trajectory.length)
    const start = Math.max(0, since - offset)
    const slice = w.trajectory.slice(start)
    res.json({
      world_id: w.world_id,
      session_id: w.session_id,
      epoch: s.epoch,
      navigation: w.navigation,
      trajectory_offset: Math.max(since, offset),
      trajectory_total: w.trajectory_absolute,
      trajectory: slice,
      recovery_status: w.recovery.status,
      nav_model: NAV_MODEL,
      mock: true,
    })
  })

  app.get('/world/checkpoints', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const w = ensure(sid)
    if (!w) {
      res.status(404).json({ detail: 'Unknown memory session' })
      return
    }
    res.json({
      world_id: w.world_id,
      session_id: w.session_id,
      checkpoints: w.checkpoints.map(publicCp),
    })
  })

  app.post('/world/checkpoints/save', (req: Request, res: Response) => {
    const sid = String(req.body?.session_id ?? '')
    const s = getSession(sid)
    const w = ensure(sid)
    if (!s || !w) {
      res.status(404).json({ detail: 'Unknown memory session' })
      return
    }
    if (w.checkpoints.length >= 32) {
      res.status(507).json({ detail: 'Checkpoint quota32 reached' })
      return
    }
    const reason = (req.body?.capture_reason as string) || 'manual'
    const cal = req.body?.calibration as
      | { calibration_id?: string; kind?: string; soft_label?: string }
      | undefined
    if (reason === 'calibration') {
      if (
        !cal?.calibration_id ||
        !/^[a-z0-9]{6,32}$/.test(cal.calibration_id) ||
        (cal.kind !== 'capture' && cal.kind !== 'return_check') ||
        !cal.soft_label
      ) {
        res.status(422).json({
          detail: 'calibration object required for capture_reason=calibration',
        })
        return
      }
    } else if (cal) {
      res.status(422).json({ detail: 'calibration only allowed with capture_reason=calibration' })
      return
    }
    syncNav(w, s)
    s.frameId += 1
    s.sequence += 1
    const jpeg = renderJpeg(s, 'MOCK')
    const sha = createHash('sha256').update(jpeg).digest('hex')
    const cid = hex()
    const label =
      String(req.body?.label ?? 'Manual checkpoint').slice(0, 100) || 'Manual checkpoint'
    const cp: Cp = {
      checkpoint_id: cid,
      world_id: w.world_id,
      session_id: sid,
      epoch: s.epoch,
      prompt: w.prompt,
      frame_id: s.frameId,
      control_seq: s.sequence,
      created_at: now(),
      provenance: 'raw_video_frame',
      label,
      navigation: { ...w.navigation },
      quality: {
        status: 'candidate_unreviewed',
        reviewed: false,
        approved: false,
        indicators: { luma_std: 45, laplacian_variance: 800, mock: 1 },
      },
      image_url: `/world/checkpoints/${cid}/image?session_id=${sid}&variant=raw`,
      enhanced_image_url: null,
      enhancement_status: 'none',
      image_sha256: sha,
      capture_reason: reason === 'calibration' ? 'calibration' : 'manual',
      calibration:
        reason === 'calibration' && cal
          ? {
              calibration_id: cal.calibration_id!,
              kind: cal.kind as 'capture' | 'return_check',
              soft_label: cal.soft_label!,
            }
          : null,
      review: { reviewed_at: null, reviewer: null, reason: null },
      rawJpeg: jpeg,
    }
    w.checkpoints.push(cp)
    res.json(publicCp(cp))
  })

  app.get('/world/checkpoints/:id', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const w = ensure(sid)
    const cp = w?.checkpoints.find((c) => c.checkpoint_id === req.params.id)
    if (!cp) {
      res.status(404).json({ detail: 'Checkpoint not in current world' })
      return
    }
    res.json(publicCp(cp))
  })

  app.get('/world/checkpoints/:id/image', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const variant = String(req.query.variant ?? 'raw')
    if (variant !== 'raw') {
      res.status(404).json({ detail: 'Image variant unavailable' })
      return
    }
    const w = worlds.get(sid)
    const cp = w?.checkpoints.find((c) => c.checkpoint_id === req.params.id)
    if (!cp) {
      res.status(404).json({ detail: 'Checkpoint not in current world' })
      return
    }
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-WorldShift-Mock', '1')
    res.send(cp.rawJpeg)
  })

  app.post('/world/checkpoints/:id/review', (req: Request, res: Response) => {
    const sid = String(req.body?.session_id ?? '')
    const w = worlds.get(sid)
    const cp = w?.checkpoints.find((c) => c.checkpoint_id === req.params.id)
    if (!cp) {
      res.status(404).json({ detail: 'Checkpoint not in current world' })
      return
    }
    const sha = cp.image_sha256
    const approved = Boolean(req.body?.approved)
    cp.quality.reviewed = true
    cp.quality.approved = approved
    cp.quality.status = approved ? 'approved' : 'rejected'
    cp.review = {
      reviewed_at: now(),
      reviewer: req.body?.reviewer != null ? String(req.body.reviewer).slice(0, 64) : null,
      reason: req.body?.reason != null ? String(req.body.reason).slice(0, 200) : null,
    }
    if (cp.image_sha256 !== sha) throw new Error('review mutated sha')
    res.json(publicCp(cp))
  })

  app.post('/world/checkpoints/restore', (req: Request, res: Response) => {
    const sid = String(req.body?.session_id ?? '')
    const cid = String(req.body?.checkpoint_id ?? '')
    // Product UI never sends accept_unreviewed — reject if present for safety tests.
    if ('accept_unreviewed' in (req.body ?? {})) {
      res.status(400).json({ detail: 'accept_unreviewed must not be sent by product UI' })
      return
    }
    const s = getSession(sid)
    const w = worlds.get(sid)
    const cp = w?.checkpoints.find((c) => c.checkpoint_id === cid)
    if (!s || !w || !cp) {
      res.status(404).json({ detail: 'Checkpoint not in current world' })
      return
    }
    if (!cp.quality.approved) {
      res
        .status(409)
        .json({ detail: 'Review checkpoint or explicitly accept unreviewed candidate' })
      return
    }
    s.epoch += 1
    s.view = {
      yaw: cp.navigation.yaw,
      pitch: cp.navigation.pitch,
      x: cp.navigation.x,
      z: cp.navigation.z,
    }
    s.keys = []
    s.mouseDx = 0
    s.mouseDy = 0
    const seg = hex()
    w.navigation = navFrom(s, seg, 'restored_view', 'checkpoint_restore', cid)
    w.trajectory.push({ ...w.navigation })
    w.trajectory_absolute += 1
    w.recovery = { status: 'completed', error: null }
    res.json({
      session_id: sid,
      world_id: w.world_id,
      status: s.status,
      epoch: s.epoch,
      checkpoint_id: cid,
      recovery_ms: 12.5,
      mock: true,
    })
  })

  app.get('/world/recovery', (req: Request, res: Response) => {
    const sid = String(req.query.session_id ?? '')
    const w = ensure(sid)
    if (!w) {
      res.status(404).json({ detail: 'Unknown memory session' })
      return
    }
    res.json(w.recovery)
  })
}

/** Patch /health JSON with v1.1 capabilities when mock memory is loaded. */
export function mockHealthCapabilities() {
  return {
    capabilities: {
      memory_api: true,
      checkpoint_restore: true,
      calibration_capture: true,
      light_navigation: true,
      calibration_backend: false,
      observations: false,
      obstacles: false,
      enhancement: false,
    },
    contract: 'world-memory-v1.1',
  }
}
