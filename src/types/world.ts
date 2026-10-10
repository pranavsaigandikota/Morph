export type WorldSceneId = 'facility' | 'warehouse' | 'lab_corridor'

export interface WorldScene {
  id: WorldSceneId
  title: string
  subtitle: string
  prompt: string
  atmosphere: string
  available: boolean
  /** Optional Waypoint seed name served by GET /seeds */
  seed?: string | null
}

export interface WorldFrameMeta {
  frame_id: number
  sequence: number
  generated_at_ms: number
  inference_ms: number
  width: number
  height: number
  mime: string
  mock: boolean
  temporal_compression: number
  client_ts?: number | null
}

export interface WorldMetrics {
  session_id: string
  /** Frames received from the engine (JPEG sub-frames), not presentation paints. */
  generated_fps: number
  /** Frames actually painted to the browser. */
  displayed_fps: number
  latency_ms: number
  /**
   * Client intentionally skipped stale presentation-queue frames (not server loss).
   * Prefer this label in the UI over “Dropped”.
   */
  presentation_skips: number
  /** Invalid JPEG / envelope decode failures on the client. */
  decode_errors: number
  /** True server-side drops when the backend reports them; otherwise null. */
  server_drops: number | null
  /** @deprecated alias of presentation_skips — keep for older overlays */
  dropped_frames: number
  gpu_memory_mb: number | null
  connection_status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error'
  mock: boolean
  engine: string | null
  gen_ms_ewma: number | null
}

export interface EngineStatus {
  ok: boolean
  mock: boolean
  engine?: string
  mode?: string
  model?: string
  temporal_compression?: number
  message?: string
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down'
  mock: boolean
  services?: Record<string, string>
}
