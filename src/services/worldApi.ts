import { engineHttpBase } from './engineConfig'
import type { EngineStatus, HealthResponse } from '../types/world'

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
    throw new Error(`Engine ${res.status}: ${path}`)
  }
  return body as T
}

/**
 * Probe Codex / Waypoint engine. Prefer /healthz+/readyz+/status (Phase-2 harness).
 * Falls back to legacy /health when present.
 */
export const worldApi = {
  async probe(): Promise<EngineStatus> {
    try {
      await engineFetch<unknown>('/healthz')
    } catch {
      try {
        const h = await engineFetch<HealthResponse>('/health')
        return {
          ok: h.status === 'ok',
          mock: !!h.mock,
          message: 'legacy /health',
        }
      } catch (err) {
        return {
          ok: false,
          mock: false,
          message: err instanceof Error ? err.message : 'engine unreachable',
        }
      }
    }

    try {
      const ready = await engineFetch<{ ready?: boolean; mode?: string; engine?: string }>(
        '/readyz',
      )
      let status: Record<string, unknown> = {}
      try {
        status = await engineFetch('/status')
      } catch {
        // optional
      }
      const mode = String(ready.mode ?? status.mode ?? '')
      const engine = String(ready.engine ?? status.engine ?? mode ?? 'waypoint')
      const mock = mode === 'mock' || engine.toLowerCase().includes('mock')
      return {
        ok: ready.ready !== false,
        mock,
        engine,
        mode,
        model: status.model ? String(status.model) : undefined,
        temporal_compression:
          typeof status.temporal_compression === 'number'
            ? status.temporal_compression
            : undefined,
      }
    } catch {
      return { ok: true, mock: false, engine: 'waypoint', message: 'healthz ok, readyz missing' }
    }
  },

  async listSeeds(): Promise<string[]> {
    try {
      const r = await engineFetch<{ seeds?: string[] }>('/seeds')
      return r.seeds ?? []
    } catch {
      return []
    }
  },

  /** Optional GPU / metrics endpoint if Codex exposes it. */
  async metrics(sessionId: string): Promise<{ gpu_memory_mb?: number; generated_fps?: number } | null> {
    try {
      return await engineFetch(`/world/metrics?session_id=${encodeURIComponent(sessionId)}`)
    } catch {
      try {
        return await engineFetch('/status')
      } catch {
        return null
      }
    }
  },
}
