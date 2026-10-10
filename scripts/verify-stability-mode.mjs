import assert from 'node:assert/strict'
import {
  STABILITY_LOOK_YAW_RESTORE,
  STABILITY_LOCOMOTION_MS_RESTORE,
  filterStabilityMoveKeys,
  shouldRestoreForLook,
  shouldRestoreForWalk,
  stabilityRestoreMessage,
} from '../src/lib/stabilityMode.ts'

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    console.error(`FAIL  ${name}: ${err.message}`)
  }
}

check('look budget triggers before old high-risk melt', () => {
  assert.equal(shouldRestoreForLook(STABILITY_LOOK_YAW_RESTORE - 1), false)
  assert.equal(shouldRestoreForLook(STABILITY_LOOK_YAW_RESTORE), true)
})

check('walk budget ~22s of locomotion', () => {
  assert.equal(shouldRestoreForWalk(STABILITY_LOCOMOTION_MS_RESTORE - 1), false)
  assert.equal(shouldRestoreForWalk(STABILITY_LOCOMOTION_MS_RESTORE), true)
})

check('walk budget 0 disables walk auto-restore', () => {
  assert.equal(shouldRestoreForWalk(999_999, 0), false)
})

check('move keys gated every other tick', () => {
  const keys = ['w', 'a']
  assert.deepEqual(filterStabilityMoveKeys(keys, 2), ['w', 'a'])
  assert.deepEqual(filterStabilityMoveKeys(keys, 3), [])
})

check('restore messages are user-visible (informed, not silent)', () => {
  for (const r of ['look_budget', 'walk_budget', 'manual']) {
    const m = stabilityRestoreMessage(r)
    assert.ok(m.toLowerCase().includes('restored'))
    assert.ok(m.length > 20)
  }
})

console.log('\n=== STABILITY MODE SUMMARY ===')
console.log(JSON.stringify({ failed, lookYaw: STABILITY_LOOK_YAW_RESTORE, walkMs: STABILITY_LOCOMOTION_MS_RESTORE }, null, 2))
if (failed) process.exit(1)
console.log('Stability mode tests: PASSED')
