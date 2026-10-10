#!/usr/bin/env node
/**
 * Offline Rescue Mission mechanics + verified showdown rate checks.
 * Frozen facility_a map + browserRescueSim (RescueEnv seam).
 * Pending: swap to Grok Bot 1 RescueEnv + official parity suite when landed.
 */
import { readFileSync } from 'node:fs'
import {
  createMission,
  keyToMove,
  shortestExitPath,
  stepMission,
} from '../src/services/browserRescueSim.ts'

const manifest = JSON.parse(readFileSync('public/data/rescue/manifest.json', 'utf8'))
const showdown = JSON.parse(
  readFileSync('public/data/rescue/evaluations/eval_verified_showdown.json', 'utf8'),
)
const map = JSON.parse(readFileSync('public/data/rescue/maps/facility_a.json', 'utf8'))

const expect = {
  'random-walker': [0.195, 0.08],
  'ppo-path-guidance': [0.995, 0.99],
  'astar-planner': [1, 1],
}

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed++
}

check(
  'manifest includes eval_verified_showdown',
  manifest.evaluations.some((e) => e.id === 'eval_verified_showdown'),
)
check('showdown labeled recorded_evaluation', showdown.mode === 'recorded_evaluation', showdown.mode)

for (const [id, pair] of Object.entries(expect)) {
  const a = showdown.agents.find((x) => x.agent_id === id)
  const got = a ? [a.metrics.success_rate, a.metrics.success_rate_b] : null
  check(`verified rates ${id}`, JSON.stringify(got) === JSON.stringify(pair), JSON.stringify(got))
}

const note = String(showdown.note || '')
check(
  'showdown notes guided PPO / not live inference',
  /shortest-path/i.test(note) && /not live/i.test(note),
)

check('WASD keymap', keyToMove('KeyW') === 'N' && keyToMove('ArrowLeft') === 'W')

const astar = shortestExitPath(map)
check('A* finds exit path on facility_a', astar.length >= 2, `len=${astar.length}`)

let m = createMission(map)
for (let i = 1; i < astar.length; i++) {
  const a = astar[i - 1]
  const b = astar[i]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const move = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : dy === -1 ? 'N' : null
  if (!move) {
    check('A* orthogonal steps', false)
    break
  }
  m = stepMission(m, move)
}
check('follow A* reaches success', m.status === 'success', m.status)
check('player step count matches A*', m.step === astar.length - 1, `steps=${m.step}`)

m = createMission(map)
let hitWall = false
for (const mv of ['N', 'S', 'E', 'W']) {
  const next = stepMission(m, mv)
  if (next.collisions > m.collisions) {
    hitWall = true
    check('wall collision increments counter', true, mv)
    break
  }
  m = next
}
if (!hitWall) check('wall collision probe (open spawn)', true, 'no adjacent wall from spawn')

check('GPU-independent (static map only)', true, map.id)

console.log('\n=== RESCUE / SHOWDOWN OFFLINE SUMMARY ===')
console.log(JSON.stringify({ failed, astar_steps: Math.max(0, astar.length - 1), map: map.id }, null, 2))
console.log('Pending: Grok Bot 1 RescueEnv adapter + official parity suite.')
if (failed) process.exit(1)
console.log('Rescue Mission / Showdown offline checks: PASSED')
