/**
 * LIVE memory/calibration capability gate.
 * Never silently switch between MOCK and LIVE.
 */

import { engineHttpBase } from '../engineConfig'
import type { WireHealth } from '../../types/wireMemory'

export const NATIVE_MODEL = 'Overworld/Waypoint-1.5-1B'
export const MEMORY_CONTRACT = 'world-memory-v1.1'
export const NATIVE_W = 1280
export const NATIVE_H = 720

export type MemoryCapabilityResult =
  | {
      ok: true
      mode: 'live'
      health: WireHealth
    }
  | {
      ok: false
      mode: 'mock' | 'unavailable'
      reason: string
      health: WireHealth | null
    }

export function evaluateMemoryCapabilities(
  health: WireHealth | null,
  frameSize: { width: number; height: number } | null,
): MemoryCapabilityResult {
  if (!health) {
    return {
      ok: false,
      mode: 'unavailable',
      reason: 'Engine /health unreachable',
      health: null,
    }
  }
  if (health.mock === true) {
    return {
      ok: false,
      mode: 'mock',
      reason: 'Engine reports mock:true',
      health,
    }
  }
  if (health.model !== NATIVE_MODEL) {
    return {
      ok: false,
      mode: 'unavailable',
      reason: `Model ${health.model} is not ${NATIVE_MODEL}`,
      health,
    }
  }
  if (health.capabilities?.memory_api !== true) {
    return {
      ok: false,
      mode: 'unavailable',
      reason: 'capabilities.memory_api is not true',
      health,
    }
  }
  if (health.contract !== MEMORY_CONTRACT) {
    return {
      ok: false,
      mode: 'unavailable',
      reason: `contract is ${String(health.contract)} (need ${MEMORY_CONTRACT})`,
      health,
    }
  }
  if (
    frameSize &&
    (frameSize.width !== NATIVE_W || frameSize.height !== NATIVE_H)
  ) {
    return {
      ok: false,
      mode: 'unavailable',
      reason: `Frames ${frameSize.width}×${frameSize.height} (need ${NATIVE_W}×${NATIVE_H})`,
      health,
    }
  }
  // Frame size unknown yet — allow provisional LIVE; re-check when frames arrive.
  return { ok: true, mode: 'live', health }
}

export async function fetchEngineHealth(): Promise<WireHealth | null> {
  try {
    const res = await fetch(`${engineHttpBase()}/health`)
    if (!res.ok) return null
    return (await res.json()) as WireHealth
  } catch {
    return null
  }
}

/**
 * Source selection: VITE_WORLD_MEMORY_SOURCE=live|mock
 * live ⇒ attempt capability gate; fall back to unavailable (not silent mock).
 * mock ⇒ explicit MOCK client.
 */
export function configuredMemorySource(): 'live' | 'mock' {
  let raw = 'mock'
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    if (env?.VITE_WORLD_MEMORY_SOURCE != null) {
      raw = String(env.VITE_WORLD_MEMORY_SOURCE)
    }
  } catch {
    /* Node */
  }
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process
    if (proc?.env?.VITE_WORLD_MEMORY_SOURCE) {
      raw = proc.env.VITE_WORLD_MEMORY_SOURCE
    }
  } catch {
    /* */
  }
  return String(raw).toLowerCase() === 'live' ? 'live' : 'mock'
}
