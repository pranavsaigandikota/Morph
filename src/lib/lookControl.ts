/**
 * Pure look-control helpers for World Explorer → Waypoint `control` messages.
 *
 * Contract (docs/codex/FRONTEND_INTEGRATION.md):
 * - Control at 20 Hz with accumulated relative mouse deltas
 * - Axes bounded ±1000, cleared after each successful send
 * - Only lowercase WASD keys
 *
 * These helpers intentionally send **much smaller** per-tick deltas than ±1000
 * so rapid turns cannot shove the autoregressive model into collapse as quickly.
 * They do not invent persistent geometry.
 */

/** Protocol hard bound from Waypoint integration docs. */
export const PROTOCOL_MOUSE_BOUND = 1000

/** Conservative default sensitivity (was 1.0 — too aggressive for Waypoint). */
export const DEFAULT_LOOK_SENSITIVITY = 0.22

/** Allowed UI sensitivity range. Keep the ceiling low so judges cannot over-crank. */
export const LOOK_SENS_MIN = 0.1
export const LOOK_SENS_MAX = 0.75

/**
 * Soft per-control-tick ceiling after sensitivity.
 * Far below protocol ±1000; limits one flick from becoming a large camera jump.
 */
export const DEFAULT_MAX_DELTA_PER_TICK = 28

/** Vertical look is slightly damped vs yaw (reduces pitch thrash). */
export const DEFAULT_PITCH_SCALE = 0.55

/** Cap raw accumulation between ticks so a blocked send cannot build a dump. */
export const DEFAULT_MAX_ACCUM = 56

export interface LookPrepareInput {
  accumulatedDx: number
  accumulatedDy: number
  sensitivity: number
  maxPerTick?: number
  pitchScale?: number
  /** Previous smoothed send (for optional one-shot EMA). */
  prevSmoothDx?: number
  prevSmoothDy?: number
  /** 0 = no smoothing (use scaled value directly). 0.25–0.45 is mild. */
  smoothAlpha?: number
}

export interface LookPrepareResult {
  mouse_dx: number
  mouse_dy: number
  /** Next EMA state (equals sent values). */
  smoothDx: number
  smoothDy: number
  /** Raw after sensitivity, before per-tick clamp / smooth (for diagnostics). */
  scaledDx: number
  scaledDy: number
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function clampSensitivity(v: number): number {
  return clamp(v, LOOK_SENS_MIN, LOOK_SENS_MAX)
}

/** Accumulate pointer movement with a hard cap (prevents backlog dumps). */
export function accumulateMouseDelta(
  current: { dx: number; dy: number },
  movementX: number,
  movementY: number,
  maxAccum: number = DEFAULT_MAX_ACCUM,
): { dx: number; dy: number } {
  return {
    dx: clamp(current.dx + movementX, -maxAccum, maxAccum),
    dy: clamp(current.dy + movementY, -maxAccum, maxAccum),
  }
}

/**
 * Build one control-tick mouse payload from accumulated movement.
 * Caller MUST clear the accumulation after calling this (whether or not the
 * WebSocket send succeeds) so deltas are never applied twice and never dump
 * after a bufferedAmount skip.
 */
export function prepareLookDelta(input: LookPrepareInput): LookPrepareResult {
  const sens = clampSensitivity(input.sensitivity)
  const maxTick = input.maxPerTick ?? DEFAULT_MAX_DELTA_PER_TICK
  const pitch = input.pitchScale ?? DEFAULT_PITCH_SCALE
  const alpha = clamp(input.smoothAlpha ?? 0, 0, 0.85)

  const scaledDx = input.accumulatedDx * sens
  const scaledDy = input.accumulatedDy * sens * pitch

  let mouse_dx = clamp(scaledDx, -maxTick, maxTick)
  let mouse_dy = clamp(scaledDy, -maxTick, maxTick)

  // Protocol safety (should already be inside maxTick ≪ 1000).
  mouse_dx = clamp(mouse_dx, -PROTOCOL_MOUSE_BOUND, PROTOCOL_MOUSE_BOUND)
  mouse_dy = clamp(mouse_dy, -PROTOCOL_MOUSE_BOUND, PROTOCOL_MOUSE_BOUND)

  if (alpha > 0) {
    const prevDx = input.prevSmoothDx ?? 0
    const prevDy = input.prevSmoothDy ?? 0
    mouse_dx = prevDx * (1 - alpha) + mouse_dx * alpha
    mouse_dy = prevDy * (1 - alpha) + mouse_dy * alpha
    mouse_dx = clamp(mouse_dx, -maxTick, maxTick)
    mouse_dy = clamp(mouse_dy, -maxTick, maxTick)
  }

  // Integer-ish wire values keep diagnostics readable; Waypoint accepts floats.
  mouse_dx = Math.round(mouse_dx * 100) / 100
  mouse_dy = Math.round(mouse_dy * 100) / 100

  return {
    mouse_dx,
    mouse_dy,
    smoothDx: mouse_dx,
    smoothDy: mouse_dy,
    scaledDx,
    scaledDy,
  }
}

/**
 * Estimate whether cumulative look since last restore is likely destabilizing.
 * Heuristic only — not a model signal.
 */
export function lookDriftRisk(
  cumulativeAbsYaw: number,
  /** Lower threshold — warn earlier so Restore Scene is offered before full melt. */
  threshold: number = 380,
): 'ok' | 'elevated' | 'high' {
  if (cumulativeAbsYaw >= threshold * 1.6) return 'high'
  if (cumulativeAbsYaw >= threshold) return 'elevated'
  return 'ok'
}
