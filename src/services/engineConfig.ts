/**
 * Codex Waypoint engine endpoints (Phase-2 protocol).
 *
 * Configure with VITE_WORLD_API_BASE_URL (default http://127.0.0.1:8000).
 *
 *   WS  /stream?seed=<optional>
 *   → text hello { type, session_id, engine, width, height, temporal_compression, seed, mock? }
 *   → binary JPEG batch envelopes (waypointEnvelope.ts)
 *   ← text { type:"control", buttons, dx, dy, scroll, ts }
 */

const DEFAULT_ENGINE = 'http://127.0.0.1:8000'

/** Absolute backend origin (Codex on the user's PC). */
export function worldApiBaseUrl(): string {
  const raw =
    import.meta.env.VITE_WORLD_API_BASE_URL ||
    import.meta.env.VITE_ENGINE_ORIGIN ||
    DEFAULT_ENGINE
  return String(raw).replace(/\/$/, '')
}

/** @deprecated alias — prefer worldApiBaseUrl() */
export function engineOrigin(): string {
  return worldApiBaseUrl()
}

/**
 * Browser HTTP base. In Vite dev we use `/engine` proxy to avoid CORS when talking
 * to localhost:8000 from the Vite origin. Production / direct mode uses the absolute URL.
 */
export function engineHttpBase(): string {
  if (import.meta.env.VITE_ENGINE_HTTP) return import.meta.env.VITE_ENGINE_HTTP
  if (import.meta.env.DEV) return '/engine'
  return worldApiBaseUrl()
}

export function engineWsUrl(pathWithQuery: string): string {
  if (import.meta.env.VITE_ENGINE_WS) {
    return `${String(import.meta.env.VITE_ENGINE_WS).replace(/\/$/, '')}${pathWithQuery}`
  }
  const http = engineHttpBase()
  if (http.startsWith('http://') || http.startsWith('https://')) {
    const u = new URL(http)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}${pathWithQuery}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${http.replace(/\/$/, '')}${pathWithQuery}`
}

export function streamUrl(seed?: string | null): string {
  const q = seed ? `?seed=${encodeURIComponent(seed)}` : ''
  return engineWsUrl(`/stream${q}`)
}

export function isDirectLocalEngine(): boolean {
  try {
    const u = new URL(worldApiBaseUrl())
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  } catch {
    return false
  }
}
