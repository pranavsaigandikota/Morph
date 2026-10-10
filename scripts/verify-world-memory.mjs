import assert from 'node:assert/strict'
import { MockWorldMemoryClient } from '../src/services/worldMemory/mockWorldMemoryClient.ts'
import { suggestionClassFromLabel } from '../src/services/worldMemory/mockObstacles.ts'

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

const c = new MockWorldMemoryClient()
check('source is mock', () => assert.equal(c.source, 'mock'))

c.attach({
  sessionId: 's1',
  worldName: 'Test',
  promptSummary: 'Neon alley',
  epoch: 1,
})
check('start checkpoint exists', () => {
  assert.equal(c.getSession().checkpoints.length, 1)
  assert.equal(c.getSession().checkpoints[0].index, 0)
})

c.noteControlHint({ keys: ['w'], mouseDx: 12, mouseDy: 0 })
c.noteControlHint({ keys: ['w'], mouseDx: 0, mouseDy: 0 })
check('trail advances on mock walk', () => {
  assert.ok(c.getSession().trail.length >= 2)
  assert.ok(Math.abs(c.getSession().pose.y) > 0 || Math.abs(c.getSession().pose.x) > 0)
})

await c.saveView()
check('manual save adds checkpoint', () => {
  assert.ok(c.getSession().checkpoints.some((x) => x.manual))
})

const id = c.getSession().checkpoints.at(-1).id
c.selectCheckpoint(id)
check('selection sync', () => assert.equal(c.getSession().selectedCheckpointId, id))

await c.restoreCheckpoint(id)
check('restore completes and bumps epoch', () => {
  assert.ok(c.getSession().pose.epoch >= 2)
  const last = c.getSession().trail.at(-1)
  assert.equal(last.continuous, false)
})

check('mock can expose enhancement candidates', () => {
  assert.equal(c.getSession().enhancementSupported, true)
})

await c.saveView()
await c.saveView()
check('Codex-shaped obstacle_analysis on non-start checkpoints', () => {
  const ready = c
    .getSession()
    .checkpoints.filter((x) => x.obstacleAnalysis?.status === 'ready')
  assert.ok(ready.length >= 1)
  const o = ready[0].obstacleAnalysis.observations[0]
  assert.equal(o.source_checkpoint_id, ready[0].id)
  assert.equal(o.source_image_sha256, ready[0].imageSha256)
  assert.equal(o.source_image_sha256.length, 64)
  assert.equal(o.direction.bearing_rad, null)
  assert.equal(o.relative_depth.units, 'within_image_rank')
  assert.equal(o.estimated_position, null)
  assert.equal(o.bbox_normalized.length, 4)
  assert.ok(typeof o.detection_score === 'number')
})

check('suggestion classes are soft labels only', () => {
  assert.equal(suggestionClassFromLabel('wall'), 'blocked')
  assert.equal(suggestionClassFromLabel('flooded ground'), 'hazard')
  assert.equal(suggestionClassFromLabel('visible pathway'), 'walkable_hint')
})

check('start analysis disabled with empty observations', () => {
  const start = c.getSession().checkpoints[0]
  assert.equal(start.obstacleAnalysis.status, 'disabled')
  assert.equal(start.obstacleAnalysis.observations.length, 0)
})

console.log('\n=== WORLD MEMORY MOCK SUMMARY ===')
console.log(JSON.stringify({ failed, checkpoints: c.getSession().checkpoints.length }, null, 2))
if (failed) process.exit(1)
console.log('World memory mock tests: PASSED')
