import { engineHttpBase } from '../engineConfig'
import type {
  Checkpoint,
  EstimatedPose,
  RestoreJob,
  TrailPoint,
  WorldMemoryClient,
  WorldMemorySession,
} from '../../types/worldMemory'
import { liveApi, MemoryApiError, type WireCheckpoint, type WireNavigation } from './liveApi'

/** Map pixels per backend estimated unit (≈ one generated second of walking). Display scale only. */
export const MAP_SCALE = 24
const NAV_POLL_MS = 350
const SNAPSHOT_POLL_MS = 3000

/** Backend yaw (rad, 0 = start view, + = right) → UI degrees clockwise from map-up. */
export const toHeadingDeg = (yaw: number) => (((yaw * 180) / Math.PI) % 360 + 360) % 360

/** Backend (x, z) → map (x, y): forward (+z) is map-up (−y). */
export function toPose(n: WireNavigation, now = performance.now()): EstimatedPose {
  return {
    x: n.x * MAP_SCALE,
    y: -n.z * MAP_SCALE,
    headingDeg: toHeadingDeg(n.yaw),
    epoch: n.epoch,
    updatedAtMs: now,
    segmentId: n.segment_id,
    navConfidence: n.confidence,
    anchorKind: n.anchor_kind,
  }
}

export function toTrail(points: WireNavigation[], prev?: TrailPoint): TrailPoint[] {
  const out: TrailPoint[] = []
  let last = prev
  for (const p of points) {
    const pose = toPose(p)
    const pt: TrailPoint = {
      x: pose.x,
      y: pose.y,
      headingDeg: pose.headingDeg,
      atMs: pose.updatedAtMs,
      epoch: p.epoch,
      segmentId: p.segment_id,
      // Never connect segments: a restore/reset is a generation jump, not walking.
      continuous: !!last && last.segmentId === p.segment_id,
    }
    out.push(pt)
    last = pt
  }
  return out
}

export function toCheckpoint(c: WireCheckpoint, index: number): Checkpoint {
  const anchor = c.capture_reason === 'anchor'
  const approved = c.quality?.approved === true
  const kind = c.capture_reason === 'initial_seed' ? 'sdxl_starter' : anchor ? 'clear_view_anchor' : 'waypoint_frame'
  const base = engineHttpBase()
  return {
    id: c.checkpoint_id,
    index,
    name: c.label,
    capturedAtMs: Date.parse(c.created_at),
    imageUrl: base + c.image_url,
    enhancedImageUrl: c.enhanced_image_url ? base + c.enhanced_image_url : null,
    imageSha256: c.image_sha256 ?? null,
    pose: c.navigation ? toPose(c.navigation) : null,
    status: 'available',
    // Seed and player-captured clear views are restorable once approved; raw Waypoint frames need review.
    restorable: approved && (kind === 'sdxl_starter' || kind === 'clear_view_anchor'),
    recoverySuitable: approved && (kind === 'sdxl_starter' || kind === 'clear_view_anchor'),
    unsuitableReason: approved ? null : 'Not approved as a recovery view',
    source: 'live',
    manual: c.capture_reason === 'manual',
    kind,
    obstacleAnalysis: null,
    captureReason: c.capture_reason,
    approved,
    reviewed: c.quality?.reviewed === true,
  }
}

function emptySession(): WorldMemorySession {
  return {
    sessionId: null,
    worldName: '',
    promptSummary: '',
    source: 'live',
    pose: { x: 0, y: 0, headingDeg: 0, epoch: 0, updatedAtMs: performance.now() },
    trail: [],
    checkpoints: [],
    selectedCheckpointId: null,
    restore: null,
    enhancementSupported: true,
  }
}

/** LIVE World Memory client: REST polling only (stream adapters untouched). */
export class LiveWorldMemoryClient implements WorldMemoryClient {
  readonly source = 'live' as const
  private session: WorldMemorySession = emptySession()
  private listeners = new Set<(s: WorldMemorySession) => void>()
  private navTimer: number | null = null
  private snapTimer: number | null = null
  private trajectoryNext = 0
  private lastEpoch = -1
  private centerRequested = false
  private busy = false

  getSession() {
    return this.session
  }
  subscribe(l: (s: WorldMemorySession) => void) {
    this.listeners.add(l)
    l(this.session)
    return () => this.listeners.delete(l)
  }
  private set(patch: Partial<WorldMemorySession>) {
    this.session = { ...this.session, ...patch }
    for (const l of this.listeners) l(this.session)
  }

  attach(opts: { sessionId: string | null; worldName: string; promptSummary: string; epoch: number }) {
    this.detach()
    this.session = { ...emptySession(), sessionId: opts.sessionId, worldName: opts.worldName, promptSummary: opts.promptSummary }
    this.trajectoryNext = 0
    this.lastEpoch = -1
    if (!opts.sessionId) return this.set({})
    void this.refreshSnapshot()
    this.navTimer = window.setInterval(() => void this.pollNav(), NAV_POLL_MS)
    this.snapTimer = window.setInterval(() => void this.refreshSnapshot(), SNAPSHOT_POLL_MS)
  }

  detach() {
    if (this.navTimer) window.clearInterval(this.navTimer)
    if (this.snapTimer) window.clearInterval(this.snapTimer)
    this.navTimer = this.snapTimer = null
  }

  private handleError(err: unknown) {
    if (err instanceof MemoryApiError && err.status === 404) {
      this.detach()
      this.set({ restore: null })
    }
  }

  private async pollNav() {
    const sid = this.session.sessionId
    if (!sid) return
    try {
      const r = await liveApi.navigation(sid, this.trajectoryNext)
      if (r.epoch < this.lastEpoch) return
      this.lastEpoch = r.epoch
      const prev = this.session.trail[this.session.trail.length - 1]
      // If the server ring buffer dropped points we requested, just continue from what it returned.
      const added = toTrail(r.trajectory, prev)
      this.trajectoryNext = r.trajectory_total
      const trail = [...this.session.trail, ...added].slice(-2048)
      const patch: Partial<WorldMemorySession> = { pose: toPose(r.navigation), trail }
      const job = this.session.restore
      if (job && job.phase === 'awaiting_frames' && r.recovery_status !== 'restoring') {
        patch.restore = { ...job, phase: 'complete', message: 'Viewpoint restored — continuity is approximate.' }
        window.setTimeout(() => this.set({ restore: null }), 900)
      }
      this.set(patch)
    } catch (err) {
      this.handleError(err)
    }
  }

  async refreshSnapshot() {
    const sid = this.session.sessionId
    if (!sid) return
    try {
      const s = await liveApi.snapshot(sid)
      if (s.epoch < this.lastEpoch) return
      this.lastEpoch = s.epoch
      const checkpoints = s.checkpoints.map(toCheckpoint)
      const patch: Partial<WorldMemorySession> = { checkpoints, pose: toPose(s.navigation) }
      if (!this.session.trail.length) {
        patch.trail = toTrail(s.trajectory)
        this.trajectoryNext = s.trajectory_total ?? s.trajectory.length
      }
      this.set(patch)
    } catch (err) {
      this.handleError(err)
    }
  }

  async saveView(): Promise<Checkpoint | null> {
    const sid = this.session.sessionId
    if (!sid) return null
    const c = await liveApi.save(sid, `Saved view ${this.session.checkpoints.length}`)
    await this.refreshSnapshot()
    return toCheckpoint(c, this.session.checkpoints.length - 1)
  }

  async captureAnchor(opts: { restoreHere: boolean }): Promise<Checkpoint | null> {
    const sid = this.session.sessionId
    if (!sid || this.busy) return null
    this.busy = true
    const startedAtMs = performance.now()
    this.set({
      restore: {
        checkpointId: 'capture',
        phase: 'preparing',
        message: opts.restoreHere
          ? 'Cleaning up this view (AI-enhanced) and continuing from it…'
          : 'Capturing and enhancing a clear view at your current spot…',
        startedAtMs,
      },
    })
    try {
      const r = await liveApi.captureAnchor(sid, { restoreHere: opts.restoreHere })
      await this.refreshSnapshot()
      const job: RestoreJob | null = opts.restoreHere
        ? { checkpointId: r.checkpoint.checkpoint_id, phase: 'awaiting_frames', message: 'Continuing from the clear view…', startedAtMs }
        : null
      this.set({ restore: job, selectedCheckpointId: r.checkpoint.checkpoint_id })
      return toCheckpoint(r.checkpoint, this.session.checkpoints.length - 1)
    } catch (err) {
      this.set({ restore: { checkpointId: 'capture', phase: 'failed', message: 'Capture failed', startedAtMs, error: String((err as Error).message) } })
      window.setTimeout(() => this.set({ restore: null }), 3000)
      return null
    } finally {
      this.busy = false
    }
  }

  selectCheckpoint(id: string | null) {
    this.set({ selectedCheckpointId: id })
  }

  async restoreCheckpoint(id: string): Promise<void> {
    const sid = this.session.sessionId
    const cp = this.session.checkpoints.find((c) => c.id === id)
    if (!sid || !cp) return
    const startedAtMs = performance.now()
    this.set({ selectedCheckpointId: id, restore: { checkpointId: id, phase: 'reinitializing', message: 'Returning to saved view…', startedAtMs } })
    try {
      await liveApi.restore(sid, id, cp.enhancedImageUrl ? 'enhanced' : 'raw')
      this.set({ restore: { checkpointId: id, phase: 'awaiting_frames', message: 'Returning to saved view…', startedAtMs } })
    } catch (err) {
      const status = err instanceof MemoryApiError ? err.status : 0
      const message =
        status === 409 ? 'This view is not approved yet, or another action is running.' :
        status === 503 ? 'Generation failed during restore. Start a new world.' :
        'Restore failed'
      this.set({ restore: { checkpointId: id, phase: 'failed', message, startedAtMs, error: String((err as Error).message) } })
      if (status !== 503) window.setTimeout(() => this.set({ restore: null }), 3000)
    }
  }

  centerOnPlayerRequested() {
    return this.centerRequested
  }
  requestCenterOnPlayer() {
    this.centerRequested = true
  }
  consumeCenterRequest() {
    this.centerRequested = false
  }
}
