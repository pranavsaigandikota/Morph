/**
 * Unit tests for liveMapping + calibration request invariants.
 */
import assert from 'node:assert/strict'
import {
  appendTrajectoryPoints,
  checkpointsWithPose,
  confidenceBand,
  mapWireCheckpoint,
  mergeTrajectoryByAbsoluteIndex,
  navToUiPose,
  shouldDiscardStaleEpoch,
  yawToHeadingDeg,
} from '../src/services/worldMemory/liveMapping.ts'
import { assertNoAngleOrUnreviewed } from '../src/services/calibration/liveCalibration.ts'
import { evaluateMemoryCapabilities } from '../src/services/worldMemory/capabilities.ts'

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

check('heading/axes mapping', () => {
  const pose = navToUiPose(
    {
      x: 3,
      z: 4,
      yaw: Math.PI / 2,
      pitch: 0,
      units: 'estimated_units',
      confidence: 0.9,
      cumulative_movement: 0,
      segment_id: 'a',
      relationship: 'estimated_continuous',
      control_seq: 1,
      epoch: 1,
      server_elapsed_ms: 100,
    },
    1000,
  )
  assert.equal(pose.x, 3)
  assert.equal(pose.y, -4)
  assert.ok(Math.abs(pose.headingDeg - 90) < 0.01)
  assert.equal(yawToHeadingDeg(-Math.PI / 2), 270)
})

check('segment breaks set continuous:false', () => {
  const merged = mergeTrajectoryByAbsoluteIndex(
    { trail: [], lastSegmentId: null, nextAbsoluteIndex: 0 },
    {
      trajectory_offset: 0,
      trajectory_total: 2,
      trajectory: [
        {
          x: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          units: 'estimated_units',
          confidence: 1,
          cumulative_movement: 0,
          segment_id: 'seg1',
          relationship: 'new_unknown',
          control_seq: 0,
          epoch: 1,
          server_elapsed_ms: 0,
        },
        {
          x: 1,
          z: 0,
          yaw: 0,
          pitch: 0,
          units: 'estimated_units',
          confidence: 0.9,
          cumulative_movement: 1,
          segment_id: 'seg2',
          relationship: 'restored_view',
          control_seq: 1,
          epoch: 2,
          server_elapsed_ms: 10,
        },
      ],
    },
  )
  assert.equal(merged.trail.length, 2)
  assert.equal(merged.trail[0].continuous, true)
  assert.equal(merged.trail[1].continuous, false)
})

check('stale epoch discarded', () => {
  assert.equal(shouldDiscardStaleEpoch(1, 3), true)
  assert.equal(shouldDiscardStaleEpoch(3, 3), false)
  assert.equal(shouldDiscardStaleEpoch(4, 3), false)
})

check('pose-less markers skipped', () => {
  const list = checkpointsWithPose([
    { id: 'a', index: 0, name: 'A', capturedAtMs: 1, imageUrl: '', status: 'available', restorable: false, source: 'live', manual: false, pose: null },
    { id: 'b', index: 1, name: 'B', capturedAtMs: 1, imageUrl: '', status: 'available', restorable: false, source: 'live', manual: false, pose: { x: 1, y: 2, headingDeg: 0, epoch: 1, updatedAtMs: 1 } },
  ])
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'b')
})

check('checkpoint mapping + strict anchor policy', () => {
  const cp = mapWireCheckpoint(
    {
      checkpoint_id: 'c1',
      world_id: 'w',
      session_id: 's',
      epoch: 1,
      prompt: 'p',
      frame_id: 2,
      control_seq: 1,
      created_at: new Date().toISOString(),
      provenance: 'raw_video_frame',
      label: 'Manual',
      navigation: {
        x: 1,
        z: 2,
        yaw: 0,
        pitch: 0,
        units: 'estimated_units',
        confidence: 1,
        cumulative_movement: 0,
        segment_id: 'seg',
        relationship: 'estimated_continuous',
        control_seq: 1,
        epoch: 1,
        server_elapsed_ms: 1,
      },
      quality: { status: 'candidate_unreviewed', reviewed: true, approved: true, indicators: {} },
      image_url: '/world/checkpoints/c1/image?session_id=s&variant=raw',
      enhanced_image_url: null,
      enhancement_status: 'none',
      image_sha256: 'a'.repeat(64),
      capture_reason: 'manual',
    },
    1,
    '/engine',
  )
  assert.equal(cp.id, 'c1')
  assert.equal(cp.manual, true)
  assert.equal(cp.kind, 'waypoint_frame')
  assert.equal(cp.recoverySuitable, false) // strict policy
  assert.equal(cp.obstacleAnalysis, null)
  assert.ok(cp.imageUrl.includes('/engine/'))
})

check('initial_seed approved can be recoverySuitable', () => {
  const cp = mapWireCheckpoint(
    {
      checkpoint_id: 'c0',
      world_id: 'w',
      session_id: 's',
      epoch: 1,
      prompt: 'p',
      frame_id: null,
      control_seq: -1,
      created_at: new Date().toISOString(),
      provenance: 'initial_seed',
      label: 'Initial seed',
      navigation: {
        x: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        units: 'estimated_units',
        confidence: 1,
        cumulative_movement: 0,
        segment_id: 'seg',
        relationship: 'new_unknown',
        control_seq: -1,
        epoch: 1,
        server_elapsed_ms: 0,
      },
      quality: { status: 'approved', reviewed: true, approved: true, indicators: {} },
      image_url: '/world/checkpoints/c0/image?session_id=s&variant=raw',
      enhanced_image_url: null,
      enhancement_status: 'none',
      image_sha256: 'b'.repeat(64),
      capture_reason: 'initial_seed',
    },
    0,
    'http://127.0.0.1:8002',
  )
  assert.equal(cp.kind, 'sdxl_starter')
  assert.equal(cp.recoverySuitable, true)
  assert.equal(cp.restorable, true)
})

check('request body never contains accept_unreviewed or angle fields', () => {
  assertNoAngleOrUnreviewed({
    session_id: 's',
    checkpoint_id: 'c',
    variant: 'raw',
  })
  assertNoAngleOrUnreviewed({
    session_id: 's',
    capture_reason: 'calibration',
    calibration: { calibration_id: 'abcdef', kind: 'capture', soft_label: 'right' },
  })
  assert.throws(() => assertNoAngleOrUnreviewed({ accept_unreviewed: true }))
  assert.throws(() => assertNoAngleOrUnreviewed({ intendedYawDeg: 90 }))
})

check('capability gate requires model+memory_api+contract', () => {
  const bad = evaluateMemoryCapabilities(
    {
      status: 'ready',
      model_loaded: true,
      model: 'Overworld/Waypoint-1.5-1B',
      capabilities: { memory_api: true, checkpoint_restore: true, calibration_capture: true, light_navigation: true, calibration_backend: false, observations: false, obstacles: false, enhancement: false },
      contract: 'world-memory-v1',
    },
    { width: 1280, height: 720 },
  )
  assert.equal(bad.ok, false)
  const good = evaluateMemoryCapabilities(
    {
      status: 'ready',
      model_loaded: true,
      model: 'Overworld/Waypoint-1.5-1B',
      capabilities: { memory_api: true, checkpoint_restore: true, calibration_capture: true, light_navigation: true, calibration_backend: false, observations: false, obstacles: false, enhancement: false },
      contract: 'world-memory-v1.1',
    },
    { width: 1280, height: 720 },
  )
  assert.equal(good.ok, true)
  const mockEngine = evaluateMemoryCapabilities(
    {
      status: 'ready',
      model_loaded: true,
      model: 'MockWaypointEngine',
      mock: true,
      contract: 'world-memory-v1.1',
      capabilities: { memory_api: true, checkpoint_restore: true, calibration_capture: true, light_navigation: true, calibration_backend: false, observations: false, obstacles: false, enhancement: false },
    },
    { width: 1280, height: 720 },
  )
  assert.equal(mockEngine.ok, false)
  assert.equal(mockEngine.mode, 'mock')
})

check('confidence band has no percent semantics', () => {
  assert.equal(confidenceBand(0.9), 'high')
  assert.equal(confidenceBand(0.5), 'medium')
  assert.equal(confidenceBand(0.1), 'low')
})

check('appendTrajectoryPoints exists for absolute index appends', () => {
  const t = appendTrajectoryPoints([], [], { absoluteStartIndex: 0 })
  assert.deepEqual(t, [])
})

console.log('\n=== LIVE MAPPING SUMMARY ===')
console.log(JSON.stringify({ failed }, null, 2))
if (failed) process.exit(1)
console.log('liveMapping tests: PASSED')
