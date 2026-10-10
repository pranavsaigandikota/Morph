import { engineHttpBase } from '../engineConfig'

/** Thin REST client for the live World Memory API (v1.2). Throws Error with .status on HTTP errors. */
export class MemoryApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${engineHttpBase()}${path}`, init)
  const text = await r.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* keep text */
  }
  if (!r.ok) {
    const detail = (body as { detail?: unknown })?.detail
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail ?? body)
    throw new MemoryApiError(r.status, msg)
  }
  return body as T
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export interface WireNavigation {
  x: number
  z: number
  yaw: number
  pitch: number
  confidence: number
  segment_id: string
  relationship: 'new_unknown' | 'estimated_continuous' | 'restored_view'
  anchor_kind?: 'world_start' | 'reset_to_seed' | 'checkpoint_restore'
  restored_from_checkpoint_id?: string | null
  epoch: number
}

export interface WireCheckpoint {
  checkpoint_id: string
  world_id: string
  session_id: string
  epoch: number
  label: string
  created_at: string
  provenance: 'initial_seed' | 'raw_video_frame'
  capture_reason?: 'initial_seed' | 'manual' | 'periodic' | 'calibration' | 'anchor'
  navigation: WireNavigation
  quality: { reviewed: boolean; approved: boolean }
  image_url: string
  enhanced_image_url: string | null
  enhancement_status: string
  image_sha256: string
}

export interface WireSnapshot {
  world_id: string
  session_id: string
  epoch: number
  checkpoints: WireCheckpoint[]
  navigation: WireNavigation
  trajectory: WireNavigation[]
  trajectory_offset?: number
  trajectory_total?: number
}

export interface WireNavRead {
  epoch: number
  navigation: WireNavigation
  trajectory: WireNavigation[]
  trajectory_offset: number
  trajectory_total: number
  recovery_status: string
}

export const liveApi = {
  snapshot: (sid: string) => call<WireSnapshot>(`/world/memory?session_id=${encodeURIComponent(sid)}`),
  navigation: (sid: string, since: number) =>
    call<WireNavRead>(`/world/navigation?session_id=${encodeURIComponent(sid)}&trajectory_since=${since}`),
  save: (sid: string, label: string) => post<WireCheckpoint>('/world/checkpoints/save', { session_id: sid, label }),
  restore: (sid: string, checkpointId: string, variant: 'raw' | 'enhanced') =>
    post<{ epoch: number; recovery_ms: number }>('/world/checkpoints/restore', {
      session_id: sid,
      checkpoint_id: checkpointId,
      variant,
    }),
  review: (sid: string, checkpointId: string, approved: boolean, reason?: string) =>
    post<WireCheckpoint>(`/world/checkpoints/${checkpointId}/review`, {
      session_id: sid,
      approved,
      reviewer: 'player',
      reason: reason ?? null,
    }),
  /** Capture the current frame, enhance it (SDXL img2img), approve it; optionally continue from it. */
  captureAnchor: (sid: string, opts: { restoreHere: boolean; label?: string; strength?: number }) =>
    post<{ checkpoint: WireCheckpoint; restored: { epoch: number } | null }>('/world/anchors/capture', {
      session_id: sid,
      label: opts.label ?? (opts.restoreHere ? 'Refresh here' : 'Clear view'),
      strength: opts.strength ?? 0.35,
      restore_here: opts.restoreHere,
    }),
}
