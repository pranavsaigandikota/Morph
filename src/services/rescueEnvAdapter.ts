/**
 * Legacy facility_a seam kept for offline showdown package helpers / older tests.
 *
 * Interactive `/mission` now uses authoritative RescueGame from
 * `src/lib/rescue-play` + `public/data/rescue-play/` (see INTEGRATION.md).
 * Do not reintroduce duplicate step logic on the mission page.
 * Verified evaluation JSON under public/data/rescue/ remains untouched.
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
