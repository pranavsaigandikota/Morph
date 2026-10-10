/**
 * World memory client factory.
 * VITE_WORLD_MEMORY_SOURCE=live|mock (default mock).
 * LIVE never silently falls back to MOCK — unavailable is explicit.
 */

import type { WorldMemoryClient } from '../../types/worldMemory'
import {
  configuredMemorySource,
  evaluateMemoryCapabilities,
  fetchEngineHealth,
} from './capabilities'
import { getLiveWorldMemoryClient, type LiveWorldMemoryClient } from './liveWorldMemoryClient'
import {
  getMockWorldMemoryClient,
  MockWorldMemoryClient,
} from './mockWorldMemoryClient'

export type ResolvedMemoryMode = 'live' | 'mock' | 'unavailable'

let resolved: ResolvedMemoryMode | null = null
let resolveReason: string | null = null
let active: WorldMemoryClient | null = null

export function getMemoryMode(): {
  mode: ResolvedMemoryMode
  reason: string | null
  configured: 'live' | 'mock'
} {
  return {
    mode: resolved ?? configuredMemorySource(),
    reason: resolveReason,
    configured: configuredMemorySource(),
  }
}

/**
 * Resolve client. For source=live, probes /health once.
 * Call again after frames arrive with frameSize to re-validate 1280×720.
 */
export async function resolveWorldMemoryClient(opts?: {
  frameSize?: { width: number; height: number } | null
  force?: boolean
}): Promise<WorldMemoryClient> {
  const configured = configuredMemorySource()
  if (configured === 'mock') {
    resolved = 'mock'
    resolveReason = 'VITE_WORLD_MEMORY_SOURCE=mock'
    active = getMockWorldMemoryClient()
    return active
  }

  const health = await fetchEngineHealth()
  const gate = evaluateMemoryCapabilities(health, opts?.frameSize ?? null)
  if (gate.ok) {
    resolved = 'live'
    resolveReason = null
    active = getLiveWorldMemoryClient()
    return active
  }

  // Explicit unavailable — do not silently attach MOCK when user asked for live.
  resolved = gate.mode === 'mock' ? 'mock' : 'unavailable'
  resolveReason = gate.reason
  if (gate.mode === 'mock') {
    active = getMockWorldMemoryClient()
    return active
  }
  // Return live client in unavailable state so UI can show "Memory unavailable".
  const live = getLiveWorldMemoryClient()
  active = live
  return live
}

export function getWorldMemoryClient(): WorldMemoryClient {
  if (active) return active
  if (configuredMemorySource() === 'live') {
    active = getLiveWorldMemoryClient()
    return active
  }
  active = getMockWorldMemoryClient()
  return active
}

export function asLiveClient(client: WorldMemoryClient): LiveWorldMemoryClient | null {
  return client.source === 'live' ? (client as LiveWorldMemoryClient) : null
}

export function asMockClient(client: WorldMemoryClient): MockWorldMemoryClient | null {
  return client instanceof MockWorldMemoryClient ? client : null
}
