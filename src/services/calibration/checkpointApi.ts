/**
 * Thin HTTP client for spatial-memory checkpoint + reset routes.
 * Capture View = POST /world/checkpoints/save — no new capture routes.
 */

import { engineHttpBase } from '../engineConfig'
import type {
  BackendCheckpoint,
  CheckpointListResponse,
  WorldResetResponse,
} from '../../types/checkpointApi'

async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) {
    throw new Error(`Engine ${res.status}: ${path}: ${JSON.stringify(body)}`)
  }
  return body as T
}

export const checkpointApi = {
  /** Probe whether checkpoint routes exist for this engine. */
  async capabilities(sessionId: string): Promise<boolean> {
    try {
      await engineFetch<CheckpointListResponse>(
        `/world/checkpoints?session_id=${encodeURIComponent(sessionId)}`,
      )
      return true
    } catch {
      return false
    }
  },

  async list(sessionId: string): Promise<CheckpointListResponse> {
    return engineFetch(
      `/world/checkpoints?session_id=${encodeURIComponent(sessionId)}`,
    )
  },

  /**
   * Capture View — saves last genuinely generated JPEG for the session.
   * Optional label is a soft tag only (not commanded yaw).
   */
  async save(sessionId: string, label?: string): Promise<BackendCheckpoint> {
    return engineFetch('/world/checkpoints/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        ...(label != null && label !== '' ? { label } : {}),
      }),
    })
  },

  async get(sessionId: string, checkpointId: string): Promise<BackendCheckpoint> {
    return engineFetch(
      `/world/checkpoints/${encodeURIComponent(checkpointId)}?session_id=${encodeURIComponent(sessionId)}`,
    )
  },

  /** Durable raw image URL (variant=raw). Never a browser canvas screenshot. */
  imageUrl(sessionId: string, checkpointId: string): string {
    return `${engineHttpBase()}/world/checkpoints/${encodeURIComponent(checkpointId)}/image?session_id=${encodeURIComponent(sessionId)}&variant=raw`
  },

  /**
   * Persist approve/reject. Updates quality.reviewed/approved only —
   * does not modify image bytes or SHA.
   */
  async review(
    sessionId: string,
    checkpointId: string,
    approved: boolean,
  ): Promise<BackendCheckpoint> {
    return engineFetch(
      `/world/checkpoints/${encodeURIComponent(checkpointId)}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, approved }),
      },
    )
  },

  /**
   * Restore original SDXL/seed via validated reset lifecycle.
   * Advances epoch, clears held controls, discards stale frames.
   */
  async resetWorld(sessionId: string): Promise<WorldResetResponse> {
    return engineFetch('/world/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
  },
}
