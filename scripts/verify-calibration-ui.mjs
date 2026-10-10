import assert from 'node:assert/strict'
import {
  CALIBRATION_QUAD,
  DIRECTION_YAW_DEG,
} from '../src/types/calibration.ts'
import {
  createMockCalibrationSession,
  mockCaptureDirection,
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

check('quad has four directions; eight yaw slots reserved', () => {
  assert.equal(CALIBRATION_QUAD.length, 4)
  assert.equal(Object.keys(DIRECTION_YAW_DEG).length, 8)
})

check('mock session captures are labeled mock_ui', () => {
  let s = createMockCalibrationSession({
    worldPrompt: 'Neon alley',
    style: 'cinematic',
    sceneSeed: null,
    generationSeed: 1,
  })
  assert.equal(s.source, 'mock')
  assert.equal(s.phase, 'world_created')
  const cap = mockCaptureDirection(s, 'forward')
  assert.equal(cap.source, 'mock_ui')
  assert.ok(cap.imageUrl.startsWith('data:image/svg+xml'))
  assert.ok(/MOCK/i.test(decodeURIComponent(cap.imageUrl)))
})

check('HF models list separates LIVE and EXPERIMENTAL', () => {
  assert.ok(HUGGING_FACE_MODELS.some((m) => m.capability === 'live'))
  assert.ok(HUGGING_FACE_MODELS.some((m) => m.capability === 'experimental'))
  assert.ok(HUGGING_FACE_MODELS.every((m) => m.cardUrl.includes('huggingface.co')))
})

check('product remains native 720p', () => {
  assert.equal(NATIVE_FRAME_W, 1280)
  assert.equal(NATIVE_FRAME_H, 720)
})

console.log('\n=== CALIBRATION UI SUMMARY ===')
console.log(JSON.stringify({ failed }, null, 2))
if (failed) process.exit(1)
console.log('Calibration UI tests: PASSED')
