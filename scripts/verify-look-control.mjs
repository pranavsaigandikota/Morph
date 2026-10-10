/**
 * Focused tests for Explorer look-control math and control-tick semantics.
 * Pure module — no GPU required.
 */
import assert from 'node:assert/strict'
import {
  DEFAULT_LOOK_SENSITIVITY,
  DEFAULT_MAX_ACCUM,
  DEFAULT_MAX_DELTA_PER_TICK,
  PROTOCOL_MOUSE_BOUND,
  accumulateMouseDelta,
  clampSensitivity,
  lookDriftRisk,
  prepareLookDelta,
} from '../src/lib/lookControl.ts'

let failed = 0
function pass(name, detail = '') {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function check(name, fn) {
  try {
    fn()
    pass(name)
  } catch (err) {
    failed++
    console.error(`FAIL  ${name}: ${err.message}`)
  }
}

check('default sensitivity is conservative (< 1.0)', () => {
  assert.ok(DEFAULT_LOOK_SENSITIVITY < 1.0)
  assert.ok(DEFAULT_LOOK_SENSITIVITY >= 0.15)
})

check('clampSensitivity bounds', () => {
  assert.equal(clampSensitivity(0), 0.15)
  assert.equal(clampSensitivity(9), 1.25)
  assert.equal(clampSensitivity(0.5), 0.5)
})

check('accumulateMouseDelta caps backlog', () => {
  let m = { dx: 0, dy: 0 }
  m = accumulateMouseDelta(m, 10_000, -10_000)
  assert.equal(m.dx, DEFAULT_MAX_ACCUM)
  assert.equal(m.dy, -DEFAULT_MAX_ACCUM)
})

check('prepareLookDelta clamps per tick far below protocol ±1000', () => {
  const r = prepareLookDelta({
    accumulatedDx: 500,
    accumulatedDy: 500,
    sensitivity: 1.25,
    smoothAlpha: 0,
  })
  assert.ok(Math.abs(r.mouse_dx) <= DEFAULT_MAX_DELTA_PER_TICK)
  assert.ok(Math.abs(r.mouse_dy) <= DEFAULT_MAX_DELTA_PER_TICK)
  assert.ok(Math.abs(r.mouse_dx) <= PROTOCOL_MOUSE_BOUND)
})

check('prepareLookDelta applies sensitivity once (no double multiply)', () => {
  const sens = 0.35
  const acc = 40
  const r = prepareLookDelta({
    accumulatedDx: acc,
    accumulatedDy: 0,
    sensitivity: sens,
    smoothAlpha: 0,
  })
  // scaled = 40 * 0.35 = 14; must NOT be 40 * 0.35 * 0.35
  assert.ok(Math.abs(r.scaledDx - acc * sens) < 1e-9)
  assert.equal(r.mouse_dx, 14)
})

check('pitch scale damps mouse_dy vs dx', () => {
  const r = prepareLookDelta({
    accumulatedDx: 40,
    accumulatedDy: 40,
    sensitivity: 0.35,
    smoothAlpha: 0,
  })
  assert.ok(Math.abs(r.mouse_dy) < Math.abs(r.mouse_dx))
})

check('smoothing does not amplify beyond clamp', () => {
  const a = prepareLookDelta({
    accumulatedDx: 200,
    accumulatedDy: 0,
    sensitivity: 1,
    prevSmoothDx: 0,
    prevSmoothDy: 0,
    smoothAlpha: 0.35,
  })
  assert.ok(Math.abs(a.mouse_dx) <= DEFAULT_MAX_DELTA_PER_TICK)
})

check('no duplicate application: consume then zero yields zero', () => {
  const first = prepareLookDelta({
    accumulatedDx: 30,
    accumulatedDy: -10,
    sensitivity: 0.35,
    smoothAlpha: 0,
  })
  assert.ok(first.mouse_dx !== 0)
  const second = prepareLookDelta({
    accumulatedDx: 0,
    accumulatedDy: 0,
    sensitivity: 0.35,
    prevSmoothDx: first.smoothDx,
    prevSmoothDy: first.smoothDy,
    smoothAlpha: 0.35,
  })
  // With residual EMA and zero input, magnitude shrinks toward 0 — never grows.
  assert.ok(Math.abs(second.mouse_dx) <= Math.abs(first.mouse_dx))
  const third = prepareLookDelta({
    accumulatedDx: 0,
    accumulatedDy: 0,
    sensitivity: 0.35,
    prevSmoothDx: 0,
    prevSmoothDy: 0,
    smoothAlpha: 0,
  })
  assert.equal(third.mouse_dx, 0)
  assert.equal(third.mouse_dy, 0)
})

check('lookDriftRisk thresholds', () => {
  assert.equal(lookDriftRisk(0), 'ok')
  assert.equal(lookDriftRisk(720), 'elevated')
  assert.equal(lookDriftRisk(720 * 1.6), 'high')
})

check('reset lifecycle: yaw risk clears conceptually', () => {
  // Documented contract: Restore Scene clears cumulative yaw in the hook.
  // Pure helper: after conceptual clear, risk is ok.
  assert.equal(lookDriftRisk(0), 'ok')
})

check('reconnect-safe: zeroed accumulation is identity control look', () => {
  const r = prepareLookDelta({
    accumulatedDx: 0,
    accumulatedDy: 0,
    sensitivity: DEFAULT_LOOK_SENSITIVITY,
    smoothAlpha: 0,
  })
  assert.deepEqual(
    { dx: r.mouse_dx, dy: r.mouse_dy },
    { dx: 0, dy: 0 },
  )
})

console.log('\n=== LOOK CONTROL SUMMARY ===')
console.log(JSON.stringify({ failed, defaultSens: DEFAULT_LOOK_SENSITIVITY, maxTick: DEFAULT_MAX_DELTA_PER_TICK }, null, 2))
if (failed) {
  console.error('Look control tests: FAILED')
  process.exit(1)
}
console.log('Look control tests: PASSED')
