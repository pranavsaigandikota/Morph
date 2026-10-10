/**
 * Stability Mode — keep Explorer video coherent longer on Waypoint.
 *
 * Autoregressive video will still drift eventually. This mode slows input and
 * performs an *informed* seed restore (visible jump + on-screen reason) before
 * the typical melt, so a judge can keep walking in a clean-looking world.
 *
 * Does not change the backend protocol or invent persistent geometry.
 */

export const STABILITY_LOOK_YAW_RESTORE = 320
export const STABILITY_LOCOMOTION_MS_RESTORE = 22_000
/** Send movement keys only on every Nth control tick (20 Hz → ~10 Hz walk). */
export const STABILITY_MOVE_EVERY_N_TICKS = 2

export type StabilityRestoreReason =
  | 'look_budget'
  | 'walk_budget'
  | 'manual'

export function shouldRestoreForLook(cumulativeAbsYaw: number): boolean {
  return cumulativeAbsYaw >= STABILITY_LOOK_YAW_RESTORE
}

export function shouldRestoreForWalk(locomotionMs: number): boolean {
  return locomotionMs >= STABILITY_LOCOMOTION_MS_RESTORE
}

/** Gate WASD so continuous hold advances the model more slowly. */
export function filterStabilityMoveKeys(
  keys: string[],
  tickIndex: number,
  everyN: number = STABILITY_MOVE_EVERY_N_TICKS,
): string[] {
  const move = keys.filter((k) => /^[wasd]$/.test(k))
  const other = keys.filter((k) => !/^[wasd]$/.test(k))
  if (move.length === 0) return keys
  if (everyN <= 1) return keys
  if (tickIndex % everyN === 0) return [...other, ...move]
  return other
}

export function stabilityRestoreMessage(reason: StabilityRestoreReason): string {
  switch (reason) {
    case 'look_budget':
      return 'Restored seed — large camera turn would melt the world. Keep looking slowly.'
    case 'walk_budget':
      return 'Restored seed — long walk budget reached so the image stays clean. Continue walking.'
    case 'manual':
      return 'Restored seed — back to the original scene image.'
  }
}
