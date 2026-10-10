/**
 * One-step-per-keypress gate for Rescue Mission (Grok Bot 1 browser demo).
 * World Explorer keeps continuous hold-to-move separately — do not reuse this there.
 */
import { keyToAction, type Action } from '../lib/rescue-play'

export type { Action }

export interface DiscreteKeyGate {
  /** Returns an action exactly once per physical press; null if held/repeat/unmapped. */
  onKeyDown(code: string, repeat: boolean): Action | null
  onKeyUp(code: string): void
  /** Clear all held keys (blur, restart, episode end). */
  reset(): void
  isHeld(code: string): boolean
}

export function createDiscreteKeyGate(): DiscreteKeyGate {
  const held = new Set<string>()

  return {
    onKeyDown(code, repeat) {
      if (repeat) return null
      if (held.has(code)) return null
      const action = keyToAction(code)
      if (action === null) return null
      held.add(code)
      return action
    },
    onKeyUp(code) {
      held.delete(code)
    },
    reset() {
      held.clear()
    },
    isHeld(code) {
      return held.has(code)
    },
  }
}

/** Arrow / WASD codes that must not scroll the page while the mission board is focused. */
export const RESCUE_MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

export function isRescueMoveCode(code: string): boolean {
  return RESCUE_MOVE_CODES.has(code)
}
