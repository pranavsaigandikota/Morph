import assert from 'node:assert/strict'
import {
  DEFAULT_HQ_SEEDS,
  HQ_TARGET,
  RECOVERY_POLICY,
  composeFirstPersonExplorePrompt,
  isRecoveryAnchorAllowed,
  candidateToGeneratedScene,
} from '../src/services/hqStarterCandidates.ts'

let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.error(`FAIL  ${name}: ${e.message}`)
  }
}

check('HQ target is 1280x720 ~30 high', () => {
  assert.equal(HQ_TARGET.width, 1280)
  assert.equal(HQ_TARGET.height, 720)
  assert.equal(HQ_TARGET.steps, 30)
  assert.equal(HQ_TARGET.quality, 'high')
})

check('default seeds are deterministic multi-seed sheet', () => {
  assert.ok(DEFAULT_HQ_SEEDS.length >= 4)
  assert.equal(new Set(DEFAULT_HQ_SEEDS).size, DEFAULT_HQ_SEEDS.length)
})

check('first-person composition guide preserves theme', () => {
  const theme = 'A rain-soaked neon alley with reflective puddles'
  const p = composeFirstPersonExplorePrompt(theme)
  assert.ok(p.includes('neon alley'))
  assert.ok(/first-person/i.test(p))
  assert.ok(/open path|forward depth|recognizable/i.test(p))
  assert.ok(p.length <= 500)
})

check('recovery policy rejects degraded Waypoint anchors', () => {
  assert.equal(RECOVERY_POLICY.allowDegradedWaypointAnchors, false)
  assert.equal(RECOVERY_POLICY.requireApprovedSdxlStarter, true)
  assert.equal(
    isRecoveryAnchorAllowed({
      kind: 'waypoint_frame',
      recoverySuitable: false,
      restorable: false,
    }),
    false,
  )
  assert.equal(
    isRecoveryAnchorAllowed({
      kind: 'sdxl_starter',
      recoverySuitable: true,
      restorable: true,
    }),
    true,
  )
})

check('candidateToGeneratedScene preserves provenance fields', () => {
  const scene = candidateToGeneratedScene({
    id: 'c1',
    prompt: 'theme',
    effectivePrompt: 'theme. first-person',
    style: 'cinematic',
    generationSeed: 202610101,
    steps: 30,
    width: 1280,
    height: 720,
    quality: 'high',
    imageUrl: 'http://127.0.0.1:8000/scenes/x/image',
    imageSha256: 'a'.repeat(64),
    sceneId: 'scene_abc',
    mock: false,
    createdAt: '2026-01-01T00:00:00Z',
    approval: 'approved',
  })
  assert.equal(scene.source, 'sdxl-hq')
  assert.equal(scene.generationSeed, 202610101)
  assert.equal(scene.seed, 'scene_abc')
  assert.equal(scene.mock, false)
})

console.log('\n=== HQ STARTER POLICY SUMMARY ===')
console.log(JSON.stringify({ failed, seeds: DEFAULT_HQ_SEEDS.length, hq: HQ_TARGET }, null, 2))
if (failed) process.exit(1)
console.log('HQ starter policy tests: PASSED')
