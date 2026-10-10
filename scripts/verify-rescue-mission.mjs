/**
 * Offline Rescue Mission + verified showdown checks.
 * Mission engine: authoritative RescueGame (@worldshift/rescue-play).
 * Showdown rates: frozen public/data/rescue evaluation JSON (untouched).
 */
import { readFileSync } from 'node:fs'
import { createDiscreteKeyGate } from '../src/services/rescueDiscreteInput.ts'
import { RescueGame, keyToAction, pathToActions, astarPath } from '../src/lib/rescue-play/index.js'

const manifest = JSON.parse(readFileSync('public/data/rescue/manifest.json', 'utf8'))
const showdown = JSON.parse(
  readFileSync('public/data/rescue/evaluations/eval_verified_showdown.json', 'utf8'),
)
const playManifest = JSON.parse(readFileSync('public/data/rescue-play/manifest.json', 'utf8'))

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

check('WASD keymap via RescueGame keyToAction', keyToAction('KeyW') === 0 && keyToAction('ArrowLeft') === 2)

{
  const gate = createDiscreteKeyGate()
  check('discrete: first KeyW steps', gate.onKeyDown('KeyW', false) === 0)
  check('discrete: ignore event.repeat', gate.onKeyDown('KeyW', true) === null)
  check('discrete: ignore held without release', gate.onKeyDown('KeyW', false) === null)
  gate.onKeyUp('KeyW')
  check('discrete: after release can step again', gate.onKeyDown('KeyW', false) === 0)
  gate.reset()
}

check('rescue-play has five missions', playManifest.missions?.length === 5, String(playManifest.missions?.length))

for (const entry of playManifest.missions) {
  const scenario = JSON.parse(
    readFileSync(`public/data/rescue-play/${entry.mission}`, 'utf8'),
  )
  const game = new RescueGame(scenario)
  const route = astarPath(game.scenario)
  check(`${entry.id}: A* finds route`, Array.isArray(route) && route.length >= 2, `len=${route?.length}`)

  const actions = pathToActions(route)
  for (const a of actions) {
    if (game.done) break
    game.step(a)
  }
  const sc = game.score()
  check(`${entry.id}: follow A* succeeds`, sc.status === 'success', sc.status)
  check(`${entry.id}: stars awarded`, sc.stars >= 1, String(sc.stars))

  // Collision penalty preserved: bump a wall from start if adjacent wall exists.
  const g2 = new RescueGame(scenario)
  const before = g2.getState().collisions
  let bumped = false
  for (const a of [0, 1, 2, 3]) {
    const r = g2.step(a)
    if (r.info.collision) {
      bumped = true
      check(`${entry.id}: collision increments`, g2.getState().collisions === before + 1)
      check(`${entry.id}: native collision reward`, r.reward < 0, String(r.reward))
      break
    }
    if (g2.done) break
  }
  if (!bumped) check(`${entry.id}: collision probe skipped (open neighbors)`, true)

  g2.restart()
  check(`${entry.id}: restart clears done`, !g2.done && g2.getState().step_count === 0)
}

console.log('\n=== RESCUE / SHOWDOWN OFFLINE SUMMARY ===')
console.log(
  JSON.stringify(
    {
      failed,
      showdown_preserved: true,
      missions: playManifest.missions.map((m) => m.id),
      engine: '@worldshift/rescue-play',
    },
    null,
    2,
  ),
)
if (failed) process.exit(1)
console.log('Rescue Mission / Showdown offline checks: PASSED')
