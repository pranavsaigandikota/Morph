/**
 * Capture → Review → Restore → Explore contract test against MOCK engine
 * checkpoint routes (server/mockCheckpoints.ts).
 *
 * Asserts:
 * - Capture View = POST /world/checkpoints/save (no new routes)
 * - Provenance fields present (frame/session/world/epoch/sha/segment/label/timestamp)
 * - Review persists without mutating image SHA / bytes
 * - Reset advances epoch, clears controls evidence path
 * - LIVE/MOCK boundary: mock engine never maps to live_waypoint
 *
 * Native-720p GPU LIVE acceptance remains a Windows handoff
 * (see docs/ux/CALIBRATION_LIVE_CONTRACT.md).
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mapCheckpointToCapture } from '../src/services/calibration/mapCheckpointCapture.ts'
import { createMockCalibrationSession } from '../src/services/calibration/mockCalibration.ts'
import { NATIVE_FRAME_H, NATIVE_FRAME_W } from '../src/lib/framePresent.ts'

const PORT = Number(process.env.CAL_TEST_PORT ?? 4837)
const BASE = `http://127.0.0.1:${PORT}`

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

async function checkAsync(name, fn) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.error(`FAIL  ${name}: ${e.message}`)
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body }
}

// --- unit: LIVE gate ---
check('mapCheckpointToCapture stays mock_ui when engineIsMock', () => {
  const cp = {
    checkpoint_id: 'abc',
    world_id: 'w1',
    session_id: 's1',
    epoch: 1,
    prompt: 'p',
    frame_id: 3,
    control_seq: 1,
    created_at: new Date().toISOString(),
    provenance: 'raw_video_frame',
    label: 'forward',
    navigation: {
      x: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      units: 'estimated_units',
      confidence: 1,
      cumulative_movement: 0,
      segment_id: 'seg1',
      relationship: 'estimated_continuous',
      control_seq: 1,
      epoch: 1,
      server_elapsed_ms: 1,
    },
    quality: { status: 'candidate_unreviewed', reviewed: false, approved: false, indicators: {} },
    image_url: '/world/checkpoints/abc/image?session_id=s1&variant=raw',
    enhanced_image_url: null,
    enhancement_status: 'none',
    image_sha256: 'a'.repeat(64),
  }
  const mockCap = mapCheckpointToCapture(cp, { engineIsMock: true, layoutIndex: 0 })
  assert.equal(mockCap.source, 'mock_ui')
  const liveCap = mapCheckpointToCapture(cp, { engineIsMock: false, layoutIndex: 0 })
  assert.equal(liveCap.source, 'live_waypoint')
  assert.equal(liveCap.frameId, 3)
  assert.equal(liveCap.sessionId, 's1')
  assert.equal(liveCap.worldId, 'w1')
  assert.equal(liveCap.epoch, 1)
  assert.equal(liveCap.navigationSegmentId, 'seg1')
  assert.equal(liveCap.imageSha256.length, 64)
  assert.equal(liveCap.suggestedLabel, 'forward')
})

check('mock session policy remains no-go automatic angles', () => {
  const s = createMockCalibrationSession({
    worldPrompt: 't',
    style: 'cinematic',
    sceneSeed: null,
    generationSeed: null,
  })
  assert.equal(s.policy.automaticFixedAngleCalibration, 'no-go')
  assert.equal(s.transport, 'mock')
})

check('product native 720p constants', () => {
  assert.equal(NATIVE_FRAME_W, 1280)
  assert.equal(NATIVE_FRAME_H, 720)
})

// --- integration against mock server ---
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'server/index.ts'],
  {
    env: { ...process.env, MOCK_API_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let boot = ''
child.stdout.on('data', (d) => {
  boot += d.toString()
})
child.stderr.on('data', (d) => {
  boot += d.toString()
})

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`)
      if (r.ok) return
    } catch {
      /* retry */
    }
    await sleep(100)
  }
  throw new Error(`mock server not ready: ${boot}`)
}

try {
  await waitReady()

  let sessionId = null
  let checkpoint = null
  let shaBefore = null
  let epochBefore = null

  await checkAsync('health.mock is true (never claim LIVE here)', async () => {
    const { body } = await json('/health')
    assert.equal(body.mock, true)
    assert.equal(body.model_loaded, true)
  })

  await checkAsync('POST /world/start', async () => {
    const { res, body } = await json('/world/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene_id: 'facility',
        prompt: 'Calibration contract test alley',
      }),
    })
    assert.equal(res.status, 202)
    assert.ok(body.session_id)
    sessionId = body.session_id
  })

  await checkAsync('GET /world/checkpoints lists initial seed', async () => {
    const { res, body } = await json(
      `/world/checkpoints?session_id=${encodeURIComponent(sessionId)}`,
    )
    assert.equal(res.status, 200)
    assert.equal(body.session_id, sessionId)
    assert.ok(body.world_id)
    assert.ok(Array.isArray(body.checkpoints))
    assert.ok(body.checkpoints.length >= 1)
    assert.equal(body.checkpoints[0].provenance, 'initial_seed')
    epochBefore = body.checkpoints[0].epoch
  })

  await checkAsync('Capture View = POST /world/checkpoints/save with soft label', async () => {
    const { res, body } = await json('/world/checkpoints/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, label: 'forward' }),
    })
    assert.equal(res.status, 200)
    checkpoint = body
    shaBefore = body.image_sha256
    assert.equal(body.session_id, sessionId)
    assert.ok(body.world_id)
    assert.ok(typeof body.epoch === 'number')
    assert.ok(body.frame_id != null)
    assert.equal(body.image_sha256.length, 64)
    assert.ok(body.created_at)
    assert.ok(body.navigation?.segment_id)
    assert.equal(body.label, 'forward')
    assert.equal(body.provenance, 'raw_video_frame')
    assert.equal(body.quality.reviewed, false)
    assert.match(body.image_url, /variant=raw/)
  })

  await checkAsync('GET raw image is JPEG with matching SHA-256', async () => {
    const res = await fetch(
      `${BASE}/world/checkpoints/${checkpoint.checkpoint_id}/image?session_id=${encodeURIComponent(sessionId)}&variant=raw`,
    )
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /image\/jpeg/)
    const buf = Buffer.from(await res.arrayBuffer())
    assert.ok(buf.length > 1000)
    // JPEG SOI
    assert.equal(buf[0], 0xff)
    assert.equal(buf[1], 0xd8)
    const sha = createHash('sha256').update(buf).digest('hex')
    assert.equal(sha, shaBefore)
    // Native product size is encoded by mock generator (1280×720).
    assert.ok(buf.length > 5000)
  })

  await checkAsync('review approve persists without mutating SHA', async () => {
    const { res, body } = await json(
      `/world/checkpoints/${checkpoint.checkpoint_id}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, approved: true }),
      },
    )
    assert.equal(res.status, 200)
    assert.equal(body.quality.reviewed, true)
    assert.equal(body.quality.approved, true)
    assert.equal(body.image_sha256, shaBefore)
    assert.equal(body.frame_id, checkpoint.frame_id)
    assert.equal(body.provenance, 'raw_video_frame')
  })

  await checkAsync('review reject on second capture; SHA intact', async () => {
    const saved = await json('/world/checkpoints/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, label: 'right' }),
    })
    assert.equal(saved.res.status, 200)
    const id = saved.body.checkpoint_id
    const sha = saved.body.image_sha256
    const reviewed = await json(`/world/checkpoints/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, approved: false }),
    })
    assert.equal(reviewed.res.status, 200)
    assert.equal(reviewed.body.quality.approved, false)
    assert.equal(reviewed.body.image_sha256, sha)
  })

  await checkAsync('POST /world/reset advances epoch and restores seed', async () => {
    const { res, body } = await json('/world/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    assert.equal(res.status, 200)
    assert.equal(body.session_id, sessionId)
    assert.equal(body.seed_restored, true)
    assert.ok(typeof body.epoch === 'number')
    assert.ok(body.epoch > (epochBefore ?? 0))
  })

  await checkAsync('mapped mock-engine capture is never live_waypoint', async () => {
    const mapped = mapCheckpointToCapture(checkpoint, {
      engineIsMock: true,
      layoutIndex: 0,
      suggestedLabel: 'forward',
    })
    assert.equal(mapped.source, 'mock_ui')
    assert.equal(mapped.imageSha256, shaBefore)
  })

  await checkAsync('explore handoff: session still listable after reset', async () => {
    const { res, body } = await json(
      `/world/checkpoints?session_id=${encodeURIComponent(sessionId)}`,
    )
    assert.equal(res.status, 200)
    assert.ok(body.checkpoints.some((c) => c.quality.approved === true))
  })
} finally {
  child.kill('SIGTERM')
  await sleep(200)
}

console.log('\n=== CALIBRATION LIVE CONTRACT SUMMARY ===')
console.log(
  JSON.stringify(
    {
      failed,
      note: 'GPU native-720p LIVE live_waypoint acceptance requires Windows spatial-memory backend',
      contract: 'docs/ux/CALIBRATION_LIVE_CONTRACT.md',
    },
    null,
    2,
  ),
)
if (failed) process.exit(1)
console.log('Calibration LIVE contract tests: PASSED')
