import assert from 'node:assert/strict'
import {
  SUGGESTED_DIRECTION_LABELS,
} from '../src/types/calibration.ts'
import {
  createMockCalibrationSession,
  mockCaptureCurrentView,
} from '../src/services/calibration/mockCalibration.ts'
import { HUGGING_FACE_MODELS } from '../src/data/huggingFaceModels.ts'
import { NATIVE_FRAME_H, NATIVE_FRAME_W } from '../src/lib/framePresent.ts'

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

check('user-guided policy forbids automatic fixed-angle', () => {
  const s = createMockCalibrationSession({
    worldPrompt: 'Neon alley',
    style: 'cinematic',
    sceneSeed: null,
    generationSeed: 1,
  })
  assert.equal(s.policy.automaticFixedAngleCalibration, 'no-go')
  assert.equal(s.policy.captureMode, 'user_guided_visual')
  assert.equal(s.seedRestoreRequired, true)
  assert.equal(s.seedRestoreDone, false)
  assert.equal(s.transport, 'mock')
  assert.equal(s.source, 'mock')
  assert.equal(s.engineSessionId, null)
})

check('suggested labels are optional soft tags', () => {
  assert.ok(SUGGESTED_DIRECTION_LABELS.includes('unlabeled'))
  assert.ok(SUGGESTED_DIRECTION_LABELS.includes('forward'))
})

check('mock Capture View is mock_ui with null SHA (not browser LIVE proof)', () => {
  const s = createMockCalibrationSession({
    worldPrompt: 'Neon alley',
    style: 'cinematic',
    sceneSeed: null,
    generationSeed: 1,
  })
  const cap = mockCaptureCurrentView(s, 'forward')
  assert.equal(cap.source, 'mock_ui')
  assert.equal(cap.imageSha256, null)
  assert.equal(cap.reviewStatus, 'pending')
  assert.equal(cap.confidence, null)
  assert.equal(cap.suggestedLabel, 'forward')
  assert.ok(cap.imageUrl.startsWith('data:image/svg+xml'))
  const decoded = decodeURIComponent(cap.imageUrl)
  assert.ok(/MOCK/i.test(decoded))
  assert.ok(/not a measured heading/i.test(decoded))
  assert.ok(/1280/i.test(decoded))
})

check('HF models list separates LIVE and EXPERIMENTAL', () => {
  assert.ok(HUGGING_FACE_MODELS.some((m) => m.capability === 'live'))
  assert.ok(HUGGING_FACE_MODELS.some((m) => m.capability === 'experimental'))
})

check('product remains native 720p', () => {
  assert.equal(NATIVE_FRAME_W, 1280)
  assert.equal(NATIVE_FRAME_H, 720)
})

console.log('\n=== USER-GUIDED CALIBRATION UI SUMMARY ===')
console.log(JSON.stringify({ failed }, null, 2))
if (failed) process.exit(1)
console.log('User-guided calibration UI tests: PASSED')
