/**
 * LIVE World Memory client — REST polling only (no stream memory events).
 * Selected when VITE_WORLD_MEMORY_SOURCE=live and capability gate passes.
 */

import { engineHttpBase } from '../engineConfig'
import type {
  Checkpoint,
  WorldMemoryClient,
  WorldMemorySession,
} from '../../types/worldMemory'
import {
  mapWireCheckpoint,
  mergeTrajectoryByAbsoluteIndex,
  navToUiPose,
  restoreBannerText,
  shouldDiscardStaleEpoch,
} from './liveMapping'
import { MemoryHttpError, memoryHttp } from './memoryHttp'

const NAV_POLL_MS = 500
const MEMORY_POLL_MS = 3000

function emptySession(source: 'live' = 'live'): WorldMemorySession {
  return {
    sessionId: null,
    worldName: 'Unnamed world',
    promptSummary: '',
    source,
    pose: {
      x: 0,
      y: 0,
      headingDeg: 0,
      epoch: 0,
      updatedAtMs: performance.now(),
    },
    trail: [],
    checkpoints: [],
    selectedCheckpointId: null,
    restore: null,
    enhancementSupported: false,
  }
}

export type LiveMemoryAvailability = 'live' | 'unavailable'

export class LiveWorldMemoryClient implements WorldMemoryClient {
  readonly source = 'live' as const
  private listeners = new Set<(s: WorldMemorySession) => void>()
  private centerRequested = false
  private session: WorldMemorySession = emptySession()
  private availability: LiveMemoryAvailability = 'live'
  private unavailableReason: string | null = null
  private lastAppliedEpoch = 0
  private trajState = {
    trail: [] as WorldMemorySession['trail'],
    lastSegmentId: null as string | null,
    nextAbsoluteIndex: 0,
  }
  private navTimer: ReturnType<typeof setInterval> | null = null
  private memTimer: ReturnType<typeof setInterval> | null = null
  private attachedSessionId: string | null = null
  private banner: string | null = null

  getSession(): WorldMemorySession {
    return this.session
  }

  getAvailability(): { status: LiveMemoryAvailability; reason: string | null } {
    return { status: this.availability, reason: this.unavailableReason }
  }

  getRestoreBanner(): string | null {
    return this.banner
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

  /** LIVE must never estimate pose from controls. */
  noteControlHint(_hint: { keys: string[]; mouseDx: number; mouseDy: number }): void {
    /* intentionally no-op */
  }

  attach(opts: {
    sessionId: string | null
    worldName: string
    promptSummary: string
    epoch: number
  }): void {
    this.detach()
    this.attachedSessionId = opts.sessionId
    this.availability = 'live'
    this.unavailableReason = null
    this.lastAppliedEpoch = opts.epoch
    this.trajState = { trail: [], lastSegmentId: null, nextAbsoluteIndex: 0 }
    this.session = {
      ...emptySession(),
      sessionId: opts.sessionId,
      worldName: opts.worldName,
      promptSummary: opts.promptSummary,
      pose: {
        x: 0,
        y: 0,
        headingDeg: 0,
        epoch: opts.epoch,
        updatedAtMs: performance.now(),
      },
    }
    this.emit()
    if (opts.sessionId) {
      void this.refreshMemory()
      this.navTimer = setInterval(() => void this.pollNavigation(), NAV_POLL_MS)
      this.memTimer = setInterval(() => void this.refreshMemory(), MEMORY_POLL_MS)
    }
  }

  detach(): void {
    if (this.navTimer) clearInterval(this.navTimer)
    if (this.memTimer) clearInterval(this.memTimer)
    this.navTimer = null
    this.memTimer = null
    this.attachedSessionId = null
  }

  private markUnavailable(reason: string) {
    this.availability = 'unavailable'
    this.unavailableReason = reason
    this.detach()
    this.emit()
  }

  private async pollNavigation(): Promise<void> {
    const sid = this.attachedSessionId
    if (!sid || this.availability !== 'live') return
    try {
      const nav = await memoryHttp.getNavigation(sid, this.trajState.nextAbsoluteIndex)
      if (shouldDiscardStaleEpoch(nav.epoch, this.lastAppliedEpoch)) return
      if (nav.epoch > this.lastAppliedEpoch) this.lastAppliedEpoch = nav.epoch

      this.trajState = mergeTrajectoryByAbsoluteIndex(this.trajState, {
        trajectory_offset: nav.trajectory_offset,
        trajectory_total: nav.trajectory_total,
        trajectory: nav.trajectory,
      })
      this.banner = restoreBannerText(nav.navigation)
      this.session = {
        ...this.session,
        pose: navToUiPose(nav.navigation, performance.now()),
        trail: this.trajState.trail,
      }
      this.emit()
    } catch (err) {
      if (err instanceof MemoryHttpError && err.status === 404) {
        this.markUnavailable('Memory unavailable')
      }
    }
  }

  async refreshMemory(): Promise<void> {
    const sid = this.attachedSessionId
    if (!sid || this.availability !== 'live') return
    try {
      const snap = await memoryHttp.getMemory(sid)
      if (shouldDiscardStaleEpoch(snap.epoch, this.lastAppliedEpoch)) return
      if (snap.epoch > this.lastAppliedEpoch) this.lastAppliedEpoch = snap.epoch

      const base = engineHttpBase()
      const checkpoints = snap.checkpoints.map((cp, i) => mapWireCheckpoint(cp, i, base))
      const offset = snap.trajectory_offset ?? 0
      // Full memory snapshot may include a trajectory prefix — merge carefully.
      if (Array.isArray(snap.trajectory) && snap.trajectory.length) {
        this.trajState = mergeTrajectoryByAbsoluteIndex(
          {
            trail: [],
            lastSegmentId: null,
            nextAbsoluteIndex: offset,
          },
          {
            trajectory_offset: offset,
            trajectory_total: snap.trajectory_total ?? offset + snap.trajectory.length,
            trajectory: snap.trajectory,
          },
        )
      }
      this.banner = restoreBannerText(snap.navigation)
      this.session = {
        ...this.session,
        sessionId: snap.session_id,
        pose: navToUiPose(snap.navigation, performance.now()),
        trail: this.trajState.trail,
        checkpoints,
        enhancementSupported: false,
      }
      this.emit()
    } catch (err) {
      if (err instanceof MemoryHttpError && err.status === 404) {
        this.markUnavailable('Memory unavailable')
      }
    }
  }

  async saveView(): Promise<Checkpoint | null> {
    const sid = this.attachedSessionId
    if (!sid) return null
    try {
      const cp = await memoryHttp.saveCheckpoint(sid, {
        label: 'Manual checkpoint',
        capture_reason: 'manual',
      })
      await this.refreshMemory()
      return this.session.checkpoints.find((c) => c.id === cp.checkpoint_id) ?? null
    } catch (err) {
      if (err instanceof MemoryHttpError && err.status === 404) {
        this.markUnavailable('Memory unavailable')
      }
      throw err
    }
  }

  selectCheckpoint(id: string | null): void {
    this.session = { ...this.session, selectedCheckpointId: id }
    this.emit()
  }

  async reviewCheckpoint(
    id: string,
    approved: boolean,
    extra?: { reviewer?: string; reason?: string },
  ): Promise<void> {
    const sid = this.attachedSessionId
    if (!sid) return
    await memoryHttp.reviewCheckpoint(sid, id, approved, extra)
    await this.refreshMemory()
  }

  async restoreCheckpoint(id: string): Promise<void> {
    const sid = this.attachedSessionId
    if (!sid) return
    this.session = {
      ...this.session,
      restore: {
        checkpointId: id,
        phase: 'preparing',
        message: 'Restoring approved viewpoint…',
        startedAtMs: performance.now(),
      },
    }
    this.emit()
    try {
      this.session = {
        ...this.session,
        restore: {
          checkpointId: id,
          phase: 'reinitializing',
          message: 'Reinitializing from approved raw checkpoint…',
          startedAtMs: this.session.restore!.startedAtMs,
        },
      }
      this.emit()
      const result = await memoryHttp.restoreCheckpoint(sid, id)
      this.lastAppliedEpoch = result.epoch
      this.trajState = {
        trail: this.trajState.trail,
        lastSegmentId: null, // force break on next point
        nextAbsoluteIndex: this.trajState.nextAbsoluteIndex,
      }
      this.session = {
        ...this.session,
        restore: {
          checkpointId: id,
          phase: 'complete',
          message: `Restored · epoch ${result.epoch}`,
          startedAtMs: this.session.restore!.startedAtMs,
        },
      }
      this.emit()
      await this.refreshMemory()
    } catch (err) {
      let message = 'Restore failed'
      if (err instanceof MemoryHttpError) {
        if (err.status === 409) {
          const detail = String(
            (err.body as { detail?: unknown })?.detail ?? err.message,
          )
          message = /busy|active|enhancement|lifecycle/i.test(detail)
            ? 'Restore busy — try again shortly'
            : 'Review this checkpoint first (approve as recovery anchor)'
        } else if (err.status === 404) {
          message = 'Checkpoint missing — refreshing memory'
          await this.refreshMemory()
        } else if (err.status === 503) {
          message = 'Restore failed — start a new world'
        }
      }
      this.session = {
        ...this.session,
        restore: {
          checkpointId: id,
          phase: 'failed',
          message,
          startedAtMs: performance.now(),
          error: message,
        },
      }
      this.emit()
    }
  }

  /** Refresh World — POST /world/reset (seed restore). */
  async refreshWorld(): Promise<void> {
    const sid = this.attachedSessionId
    if (!sid) return
    const result = await memoryHttp.resetWorld(sid)
    if (typeof result.epoch === 'number') this.lastAppliedEpoch = result.epoch
    this.trajState = {
      trail: this.trajState.trail,
      lastSegmentId: null,
      nextAbsoluteIndex: this.trajState.nextAbsoluteIndex,
    }
    await this.refreshMemory()
  }

  centerOnPlayerRequested(): boolean {
    return this.centerRequested
  }

  consumeCenterRequest(): void {
    this.centerRequested = false
  }

  requestCenterOnPlayer(): void {
    this.centerRequested = true
    this.emit()
  }
}

let liveSingleton: LiveWorldMemoryClient | null = null

export function getLiveWorldMemoryClient(): LiveWorldMemoryClient {
  if (!liveSingleton) liveSingleton = new LiveWorldMemoryClient()
  return liveSingleton
}
