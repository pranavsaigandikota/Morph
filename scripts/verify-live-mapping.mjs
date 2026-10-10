// Map orientation checks for the LIVE adapter (no backend needed). Run: npx tsx scripts/verify-live-mapping.mjs
import assert from 'node:assert/strict'
import { toPose, toTrail, toHeadingDeg, MAP_SCALE } from '../src/services/worldMemory/liveWorldMemoryClient.ts'

const nav = (x, z, yaw, seg = 's1') => ({ x, z, yaw, pitch: 0, confidence: 1, segment_id: seg, relationship: 'estimated_continuous', epoch: 1 })
let n = 0
const check = (name, fn) => { fn(); n++; console.log('PASS', name) }

check('start faces map-up, heading 0', () => assert.equal(toHeadingDeg(0), 0))
check('walking forward (+z) moves the marker UP the map (−y)', () => {
  const p = toPose(nav(0, 2, 0)); assert.equal(p.x, 0); assert.ok(p.y < 0); assert.equal(p.y, -2 * MAP_SCALE)
})
check('turning right (+yaw) rotates heading clockwise (toward +x / right)', () => {
  assert.equal(Math.round(toHeadingDeg(Math.PI / 2)), 90)
  assert.equal(Math.round(toHeadingDeg(-Math.PI / 2)), 270)
})
check('walking after a right turn moves the marker RIGHT', () => {
  // Backend dead reckoning: forward = (sin yaw, cos yaw) in (x, z). Right turn then walk => +x.
  const yaw = Math.PI / 2, x = Math.sin(yaw) * 1, z = Math.cos(yaw) * 1
  const p = toPose(nav(x, z, yaw)); assert.ok(p.x > 0); assert.ok(Math.abs(p.y) < 1e-9)
})
check('the arrow SVG rotate(headingDeg) points the same way the marker moves', () => {
  // SVG rotate(θ) turns the up-pointing arrow (0,-1) clockwise to (sin θ, −cos θ).
  const yaw = 0.7, h = (toHeadingDeg(yaw) * Math.PI) / 180
  const arrow = [Math.sin(h), -Math.cos(h)]
  const step = toPose(nav(Math.sin(yaw), Math.cos(yaw), yaw))
  const len = Math.hypot(step.x, step.y)
  assert.ok(Math.abs(arrow[0] - step.x / len) < 1e-9 && Math.abs(arrow[1] - step.y / len) < 1e-9)
})
check('trail never connects different segments (restore/reset)', () => {
  const t = toTrail([nav(0, 0, 0, 'a'), nav(0, 1, 0, 'a'), nav(0, 0, 0, 'b'), nav(0, 1, 0, 'b')])
  assert.deepEqual(t.map((p) => p.continuous), [false, true, false, true])
})
console.log(`\n${n} mapping checks passed`)
