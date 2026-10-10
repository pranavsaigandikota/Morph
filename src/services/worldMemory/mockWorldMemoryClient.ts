import { MOCK_BADGE, mockCheckpointImage, mockEnhancedCheckpointImage } from './mockFixtures'
import { mockImageSha256, mockObstacleAnalysisForCheckpoint } from './mockObstacles'
import { RECOVERY_POLICY } from '../hqStarterCandidates'
import type {
  Checkpoint,
  EstimatedPose,
  TrailPoint,
  WorldMemoryClient,
  WorldMemorySession,
} from '../../types/worldMemory'

const STEP = 4.2
const TURN_PER_MOUSE = 0.08
const MAX_TRAIL = 400

function emptyPose(epoch = 0): EstimatedPose {
  return {
    x: 0,
    y: 0,
    headingDeg: 0,
    uncertainty: 0.35,
    epoch,
    updatedAtMs: performance.now(),
  }
}

/**
 * MOCK World Memory client.
 * Simulates estimated pose from control hints for UI development only.
 * Replace with LiveWorldMemoryClient when Codex publishes API_CONTRACT.md.
 */
export class MockWorldMemoryClient implements WorldMemoryClient {
  readonly source = 'mock' as const
  private listeners = new Set<(s: WorldMemorySession) => void>()
  private centerRequested = false
  private autoIndex = 0
  private lastAutoAt = 0
  private session: WorldMemorySession = {
    sessionId: null,
    worldName: 'Unnamed world',
    promptSummary: '',
    source: 'mock',
    pose: emptyPose(),
    trail: [{ x: 0, y: 0, headingDeg: 0, atMs: performance.now(), epoch: 0, continuous: true }],
    checkpoints: [],
    selectedCheckpointId: null,
    restore: null,
    enhancementSupported: true,
  }

  getSession(): WorldMemorySession {
    return this.session
  }

  subscribe(listener: (s: WorldMemorySession) => void): () => void {
    this.listeners.add(listener)
    listener(this.session)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snap = this.session
    for (const l of this.listeners) l(snap)
  }

  attach(opts: {
    sessionId: string | null
    worldName: string
    promptSummary: string
    epoch: number
  }): void {
    const pose = emptyPose(opts.epoch)
    const startId = `mock-start-${opts.sessionId ?? 'local'}`
    const startSha = mockImageSha256(startId)
    const startCp: Checkpoint = {
      id: startId,
      index: 0,
      name: 'Start',
      capturedAtMs: Date.now(),
      imageUrl: mockCheckpointImage(0, 'Start'),
      enhancedImageUrl: null,
      imageSha256: startSha,
      pose,
      status: 'available',
      restorable: true,
      source: 'mock',
      manual: false,
      // Scene-start / approved SDXL path — only suitable recovery anchor in MOCK demo.
      kind: 'sdxl_starter',
      recoverySuitable: true,
      unsuitableReason: null,
      obstacleAnalysis: {
        status: 'disabled',
        job_id: null,
        source_image_sha256: startSha,
        observations: [],
      },
    }
    this.autoIndex = 0
    this.lastAutoAt = performance.now()
    // Explicit rejected early Waypoint frame — never a recovery anchor.
    const earlyId = `mock-early-wp-${opts.sessionId ?? 'local'}`
    const earlySha = mockImageSha256(earlyId)
    const earlyRejected: Checkpoint = {
      id: earlyId,
      index: 1,
      name: 'Early Waypoint (rejected anchor)',
      capturedAtMs: Date.now(),
      imageUrl: mockCheckpointImage(1, 'Early WP'),
      enhancedImageUrl: null,
      imageSha256: earlySha,
      pose: { ...pose, x: 8, y: -6 },
      status: 'available',
      restorable: false,
      source: 'mock',
      manual: false,
      kind: 'waypoint_frame',
      recoverySuitable: false,
      unsuitableReason: RECOVERY_POLICY.rejectReason,
      obstacleAnalysis: {
        status: 'disabled',
        job_id: null,
        source_image_sha256: earlySha,
        observations: [],
      },
    }
    this.session = {
      sessionId: opts.sessionId,
      worldName: opts.worldName,
      promptSummary: opts.promptSummary || MOCK_BADGE,
      source: 'mock',
      pose,
      trail: [
        {
          x: 0,
          y: 0,
          headingDeg: 0,
          atMs: performance.now(),
          epoch: opts.epoch,
          continuous: true,
        },
      ],
      checkpoints: [startCp, earlyRejected],
      selectedCheckpointId: startCp.id,
      restore: null,
      // Mock can demo raw/enhanced preview; live must follow Codex capability flags.
      enhancementSupported: true,
    }
    this.emit()
  }

  detach(): void {
    this.session = {
      ...this.session,
      sessionId: null,
      restore: null,
    }
    this.emit()
  }

  noteControlHint(hint: { keys: string[]; mouseDx: number; mouseDy: number }): void {
    if (this.session.restore && this.session.restore.phase !== 'complete') return
    let { x, y, headingDeg, epoch } = this.session.pose
    headingDeg = (headingDeg + hint.mouseDx * TURN_PER_MOUSE + 360) % 360
    const rad = (headingDeg * Math.PI) / 180
    const keys = new Set(hint.keys.map((k) => k.toLowerCase()))
    let forward = 0
    let strafe = 0
    if (keys.has('w')) forward += 1
    if (keys.has('s')) forward -= 1
    if (keys.has('d')) strafe += 1
    if (keys.has('a')) strafe -= 1
    if (forward || strafe) {
      const len = Math.hypot(forward, strafe) || 1
      forward /= len
      strafe /= len
      x += (Math.sin(rad) * forward + Math.cos(rad) * strafe) * STEP
      y += (-Math.cos(rad) * forward + Math.sin(rad) * strafe) * STEP
    }
    const pose: EstimatedPose = {
      x,
      y,
      headingDeg,
      uncertainty: 0.4,
      epoch,
      updatedAtMs: performance.now(),
    }
    const last = this.session.trail[this.session.trail.length - 1]
    const moved =
      !last || Math.hypot(pose.x - last.x, pose.y - last.y) > 1.2 || Math.abs(pose.headingDeg - last.headingDeg) > 4
    let trail = this.session.trail
    if (moved) {
      const pt: TrailPoint = {
        x: pose.x,
        y: pose.y,
        headingDeg: pose.headingDeg,
        atMs: pose.updatedAtMs,
        epoch,
        continuous: true,
      }
      trail = [...trail, pt]
      if (trail.length > MAX_TRAIL) trail = trail.slice(-MAX_TRAIL)
    }
    this.session = { ...this.session, pose, trail }

    // Occasional auto “remembered view” while exploring (MOCK).
    const now = performance.now()
    if (moved && now - this.lastAutoAt > 12000 && this.session.trail.length > 8) {
      this.lastAutoAt = now
      void this.captureInternal(false, `Memory ${++this.autoIndex}`)
      return
    }
    this.emit()
  }

  private async captureInternal(manual: boolean, name: string): Promise<Checkpoint> {
    const index = this.session.checkpoints.length
    const withEnhance = index > 0 && index % 2 === 1
    const id = `mock-cp-${Date.now()}-${index}`
    const imageSha256 = mockImageSha256(id)
    // Auto / early Waypoint frames: unsuitable recovery anchors (policy).
    // Manual Save View stays restorable for verified restore UX — human must still
    // refuse blurry/blob frames; UI surfaces the unsuitable banner for auto captures.
    const recoverySuitable = manual
    const draft: Checkpoint = {
      id,
      index,
      name: !manual ? `${name} (unsuitable anchor)` : name,
      capturedAtMs: Date.now(),
      imageUrl: mockCheckpointImage(index + 3, name),
      enhancedImageUrl: withEnhance
        ? mockEnhancedCheckpointImage(index + 3, name)
        : null,
      imageSha256,
      pose: { ...this.session.pose },
      status: withEnhance ? 'enhanced' : 'available',
      restorable: recoverySuitable,
      source: 'mock',
      manual,
      kind: 'waypoint_frame',
      recoverySuitable,
      unsuitableReason: recoverySuitable ? null : RECOVERY_POLICY.rejectReason,
    }
    const cp: Checkpoint = {
      ...draft,
      // Analysis always keyed to original SHA — never enhanced bytes.
      obstacleAnalysis: mockObstacleAnalysisForCheckpoint(draft),
    }
    this.session = {
      ...this.session,
      checkpoints: [...this.session.checkpoints, cp],
      selectedCheckpointId: manual ? cp.id : this.session.selectedCheckpointId,
    }
    this.emit()
    return cp
  }

  async saveView(): Promise<Checkpoint | null> {
    return this.captureInternal(true, `Saved view ${this.session.checkpoints.length}`)
  }

  selectCheckpoint(id: string | null): void {
    this.session = { ...this.session, selectedCheckpointId: id }
    this.emit()
  }

  async restoreCheckpoint(id: string): Promise<void> {
    const cp = this.session.checkpoints.find((c) => c.id === id)
    if (!cp || !cp.restorable || cp.recoverySuitable === false) {
      this.session = {
        ...this.session,
        restore: {
          checkpointId: id,
          phase: 'failed',
          message: cp?.unsuitableReason ?? RECOVERY_POLICY.rejectReason,
          startedAtMs: performance.now(),
          error: cp?.recoverySuitable === false ? 'unsuitable_recovery_anchor' : 'not_restorable',
        },
      }
      this.emit()
      return
    }
    const startedAtMs = performance.now()
    this.session = {
      ...this.session,
      selectedCheckpointId: id,
      restore: {
        checkpointId: id,
        phase: 'preparing',
        message: 'Preparing remembered view…',
        startedAtMs,
      },
      checkpoints: this.session.checkpoints.map((c) =>
        c.id === id ? { ...c, status: 'restore_in_progress' } : c,
      ),
    }
    this.emit()
    await sleep(350)
    this.session = {
      ...this.session,
      restore: {
        checkpointId: id,
        phase: 'reinitializing',
        message: 'Reinitializing generation from remembered view (approximate continuity)…',
        startedAtMs,
      },
    }
    this.emit()
    await sleep(700)
    const newEpoch = this.session.pose.epoch + 1
    const pose: EstimatedPose = cp.pose
      ? { ...cp.pose, epoch: newEpoch, updatedAtMs: performance.now() }
      : emptyPose(newEpoch)
    const breakPt: TrailPoint = {
      x: pose.x,
      y: pose.y,
      headingDeg: pose.headingDeg,
      atMs: performance.now(),
      epoch: newEpoch,
      continuous: false,
    }
    this.session = {
      ...this.session,
      pose,
      trail: [...this.session.trail, breakPt],
      restore: {
        checkpointId: id,
        phase: 'complete',
        message: 'Viewpoint restored — visual continuity is approximate.',
        startedAtMs,
      },
      checkpoints: this.session.checkpoints.map((c) =>
        c.id === id ? { ...c, status: 'restored' } : c,
      ),
    }
    this.emit()
    await sleep(400)
    this.session = {
      ...this.session,
      restore: null,
      checkpoints: this.session.checkpoints.map((c) =>
        c.id === id ? { ...c, status: 'available' } : c,
      ),
    }
    this.emit()
  }

  centerOnPlayerRequested(): boolean {
    return this.centerRequested
  }

  requestCenterOnPlayer(): void {
    this.centerRequested = true
  }

  consumeCenterRequest(): void {
    this.centerRequested = false
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

let singleton: MockWorldMemoryClient | null = null

/** Default client until Codex contract + live adapter exist. */
export function getWorldMemoryClient(): WorldMemoryClient {
  if (!singleton) singleton = new MockWorldMemoryClient()
  return singleton
}

export function getMockWorldMemoryClient(): MockWorldMemoryClient {
  const c = getWorldMemoryClient()
  if (!(c instanceof MockWorldMemoryClient)) {
    singleton = new MockWorldMemoryClient()
    return singleton
  }
  return c
}
