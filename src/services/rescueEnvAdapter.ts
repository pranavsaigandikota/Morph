/**
 * Seam for Grok Bot 1's authoritative TypeScript RescueEnv adapter.
 *
 * Until that package is checked into the repo (or published), Interactive
 * Missions use `browserRescueSim.ts` against the frozen facility_a map schema.
 * Do NOT invent alternate physics here — swap implementations behind this API
 * when the handoff lands, and keep verified evaluation JSON untouched.
 */

import type { BuildingMap } from '../types/simulation'
import {
  createMission,
  keyToMove,
  shortestExitPath,
  stepMission,
  type RescueMissionState,
  type RescueMove,
} from './browserRescueSim'

export type { RescueMissionState, RescueMove }

export interface RescueEnvAdapter {
  readonly source: 'browser-sim' | 'grok-rescue-env'
  create(map: BuildingMap, maxSteps?: number): RescueMissionState
  step(state: RescueMissionState, move: RescueMove): RescueMissionState
  keyToMove(code: string): RescueMove | null
  shortestExitPath(map: BuildingMap): Array<{ x: number; y: number }>
}

/** Current default — replace with Grok RescueEnv wrapper when available. */
export const rescueEnvAdapter: RescueEnvAdapter = {
  source: 'browser-sim',
  create: createMission,
  step: stepMission,
  keyToMove,
  shortestExitPath,
}

export function rescueEnvSourceLabel(): string {
  return rescueEnvAdapter.source === 'grok-rescue-env'
    ? 'Grok RescueEnv (authoritative)'
    : 'Browser sim (facility map schema) — awaiting Grok RescueEnv handoff'
}
