import assert from 'node:assert/strict'
import { MockWorldMemoryClient } from '../src/services/worldMemory/mockWorldMemoryClient.ts'

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
check('mock obstacles attach to non-start checkpoints', () => {
  const withObs = c.getSession().checkpoints.filter((x) => (x.obstacles?.length ?? 0) > 0)
  assert.ok(withObs.length >= 1)
  const o = withObs[0].obstacles[0]
  assert.ok(['blocked', 'hazard', 'walkable_hint'].includes(o.kind))
  assert.ok(o.confidence > 0 && o.confidence <= 1)
  assert.equal(o.checkpointId, withObs[0].id)
})

console.log('\n=== WORLD MEMORY MOCK SUMMARY ===')
console.log(JSON.stringify({ failed, checkpoints: c.getSession().checkpoints.length }, null, 2))
if (failed) process.exit(1)
console.log('World memory mock tests: PASSED')
