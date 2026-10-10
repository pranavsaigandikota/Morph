/**
 * REST helpers for World Memory API v1.1.
 * Does not modify frozen worldApi.ts — separate surface for memory routes.
 */

import { engineHttpBase } from '../engineConfig'
import type {
  SoftLabel,
  WireCheckpoint,
  WireMemorySnapshot,
  WireNavigationRead,
  WireRestoreResponse,
} from '../../types/wireMemory'

export class MemoryHttpError extends Error {
  status: number
  body: unknown
  constructor(status: number, path: string, body: unknown) {
    super(`Memory ${status}: ${path}: ${JSON.stringify(body)}`)
    this.status = status
    this.body = body
  }
}

async function memoryFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${engineHttpBase()}${path}`, init)
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) throw new MemoryHttpError(res.status, path, body)
  return body as T
}

export const memoryHttp = {
  getMemory(sessionId: string): Promise<WireMemorySnapshot> {
    return memoryFetch(
      `/world/memory?session_id=${encodeURIComponent(sessionId)}`,
    )
  },

  getNavigation(sessionId: string, trajectorySince: number): Promise<WireNavigationRead> {
    return memoryFetch(
      `/world/navigation?session_id=${encodeURIComponent(sessionId)}&trajectory_since=${trajectorySince}`,
    )
  },

  saveCheckpoint(
    sessionId: string,
    opts: {
      label?: string
      capture_reason?: 'manual' | 'calibration'
      calibration?: {
        calibration_id: string
        kind: 'capture' | 'return_check'
        soft_label: SoftLabel
      }
    } = {},
  ): Promise<WireCheckpoint> {
    const body: Record<string, unknown> = {
      session_id: sessionId,
      label: opts.label ?? 'Manual checkpoint',
    }
    if (opts.capture_reason) body.capture_reason = opts.capture_reason
    if (opts.calibration) body.calibration = opts.calibration
    return memoryFetch('/world/checkpoints/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },

  reviewCheckpoint(
    sessionId: string,
    checkpointId: string,
    approved: boolean,
    extra?: { reviewer?: string; reason?: string },
  ): Promise<WireCheckpoint> {
    const body: Record<string, unknown> = {
      session_id: sessionId,
      approved,
    }
    if (extra?.reviewer) body.reviewer = extra.reviewer
    if (extra?.reason) body.reason = extra.reason
    return memoryFetch(
      `/world/checkpoints/${encodeURIComponent(checkpointId)}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
  },

  /** Never send accept_unreviewed. */
  restoreCheckpoint(
    sessionId: string,
    checkpointId: string,
  ): Promise<WireRestoreResponse> {
    return memoryFetch('/world/checkpoints/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        checkpoint_id: checkpointId,
        variant: 'raw',
      }),
    })
  },

  resetWorld(sessionId: string): Promise<{ session_id: string; status: string; epoch?: number }> {
    return memoryFetch('/world/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
  },
}
