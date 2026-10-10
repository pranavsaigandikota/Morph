/**
 * Codex Waypoint service endpoints (authoritative implemented protocol).
 *
 * Configure with VITE_WORLD_API_BASE_URL (default http://127.0.0.1:8000).
 *
 *   POST /world/start → session_id
 *   WS /world/stream?session_id=<id>
 *   → text frame metadata, then one complete binary JPEG per generated frame
 *   ← control {type,seq,keys,mouse_dx,mouse_dy,timestamp_ms}; display_ack credit
 */

const DEFAULT_ENGINE = 'http://127.0.0.1:8000'

function viteEnv(key: string): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    const v = env?.[key]
    if (v == null) return undefined
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    const s = String(v)
    return s.length ? s : undefined
  } catch {
    return undefined
  }
}

function nodeEnv(key: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process
    const v = proc?.env?.[key]
    return v != null && String(v).length ? String(v) : undefined
  } catch {
    return undefined
  }
}

/** Absolute backend origin (Codex on the user's PC). */
export function worldApiBaseUrl(): string {
  const raw =
    viteEnv('VITE_WORLD_API_BASE_URL') ||
    viteEnv('VITE_ENGINE_ORIGIN') ||
    nodeEnv('VITE_WORLD_API_BASE_URL') ||
    nodeEnv('VITE_ENGINE_ORIGIN') ||
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
  const override = viteEnv('VITE_ENGINE_HTTP') || nodeEnv('VITE_ENGINE_HTTP')
  if (override) return override
  // Browser Vite dev uses /engine proxy; Node scripts use absolute origin.
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
    if (typeof window !== 'undefined' && env?.DEV) return '/engine'
  } catch {
    /* Node */
  }
  return worldApiBaseUrl()
}

export function engineWsUrl(pathWithQuery: string): string {
  const wsOverride = viteEnv('VITE_ENGINE_WS') || nodeEnv('VITE_ENGINE_WS')
  if (wsOverride) {
    return `${String(wsOverride).replace(/\/$/, '')}${pathWithQuery}`
  }
  const http = engineHttpBase()
  if (http.startsWith('http://') || http.startsWith('https://')) {
    const u = new URL(http)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}${pathWithQuery}`
  }
  const proto =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:'
  const host =
    typeof window !== 'undefined' ? window.location.host : '127.0.0.1'
  return `${proto}//${host}${http.replace(/\/$/, '')}${pathWithQuery}`
}

export function streamUrl(sessionId: string): string {
  return engineWsUrl(`/world/stream?session_id=${encodeURIComponent(sessionId)}`)
}

export function isDirectLocalEngine(): boolean {
  try {
    const u = new URL(worldApiBaseUrl())
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  } catch {
    return false
  }
}
