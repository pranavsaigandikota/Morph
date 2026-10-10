/**
 * Waypoint / WorldShift engine endpoints.
 *
 * Real inference (Codex): http://127.0.0.1:8000
 * Local protocol-compatible mock: http://127.0.0.1:4822 (via Vite /engine proxy fallback)
 *
 * Protocol (Waypoint Phase-2 / Biome-compatible):
 *   WS  /stream?seed=<optional>
 *   → text hello { type, session_id, engine, width, height, temporal_compression, seed, mock? }
 *   → binary batch envelopes (see waypointEnvelope.ts)
 *   ← text { type:"control", buttons, dx, dy, scroll, ts }
 */

export type EngineMode = 'real' | 'mock' | 'unknown'

const DEFAULT_ENGINE = 'http://127.0.0.1:8000'

/** Browser-facing HTTP base (proxied in dev to avoid CORS). */
export function engineHttpBase(): string {
  return import.meta.env.VITE_ENGINE_HTTP ?? '/engine'
}

/** Absolute engine origin for diagnostics / scripts. */
export function engineOrigin(): string {
  return import.meta.env.VITE_ENGINE_ORIGIN ?? DEFAULT_ENGINE
}

export function engineWsUrl(pathWithQuery: string): string {
  const configured = import.meta.env.VITE_ENGINE_WS as string | undefined
  if (configured) {
    return `${configured.replace(/\/$/, '')}${pathWithQuery}`
  }
  const http = engineHttpBase()
  if (http.startsWith('http://') || http.startsWith('https://')) {
    const u = new URL(http)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}${pathWithQuery}`
  }
  // Relative proxy path (e.g. /engine) → same host, ws scheme
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${http.replace(/\/$/, '')}${pathWithQuery}`
}

export function streamUrl(seed?: string | null): string {
  const q = seed ? `?seed=${encodeURIComponent(seed)}` : ''
  return engineWsUrl(`/stream${q}`)
}
