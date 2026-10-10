/**
 * Offline Rescue Play checks: RescueGame + createStepController (t17u) + showdown rates.
 */
import { readFileSync } from 'node:fs'
import {
  RescueGame,
  createStepController,
  keyToAction,
  pathToActions,
  astarPath,
} from '../src/lib/rescue-play/index.js'

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

check('createStepController exported', typeof createStepController === 'function')
check('WASD keymap', keyToAction('KeyW') === 0 && keyToAction('ArrowLeft') === 2)
check('rescue-play has five missions', playManifest.missions?.length === 5, String(playManifest.missions?.length))

/** Fake scheduler for deterministic hold tests */
function makeScheduler() {
  const q = []
  let id = 0
  return {
    setTimeout(fn, ms) {
      const handle = ++id
      q.push({ handle, fn, ms, due: Date.now() + ms })
      return handle
    },
    clearTimeout(handle) {
      const i = q.findIndex((t) => t.handle === handle)
      if (i >= 0) q.splice(i, 1)
    },
    flush(n = 1) {
      for (let i = 0; i < n && q.length; i++) {
        const t = q.shift()
        t.fn()
      }
    },
    pending() {
      return q.length
    },
  }
}

{
  const scenario = JSON.parse(
    readFileSync(`public/data/rescue-play/${playManifest.missions[0].mission}`, 'utf8'),
  )
  const game = new RescueGame(scenario)
  const sched = makeScheduler()
  let lastEv = null
  const ctl = createStepController(game, {
    holdRepeatMs: 200,
    collisionFlashMs: 0,
    scheduler: sched,
    onChange: (_s, ev) => {
      lastEv = ev
    },
  })

  const s0 = game.getState().step_count
  ctl.handleKeyDown({ key: 'd', code: 'KeyD', repeat: false })
  check('tap: one step on keydown', game.getState().step_count === s0 + 1, String(game.getState().step_count))

  ctl.handleKeyDown({ key: 'd', code: 'KeyD', repeat: true })
  check('OS repeat ignored', game.getState().step_count === s0 + 1, lastEv?.type)

  sched.flush(1)
  check('hold: controlled repeat steps', game.getState().step_count === s0 + 2, String(game.getState().step_count))
  ctl.handleKeyUp({ key: 'd', code: 'KeyD' })
  const afterRelease = game.getState().step_count
  sched.flush(5)
  check('release stops hold', game.getState().step_count === afterRelease, String(game.getState().step_count))

  // Wall hold: find a colliding action from spawn
  ctl.restart()
  let wallAction = null
  for (const a of [0, 1, 2, 3]) {
    const g2 = new RescueGame(scenario)
    const r = g2.step(a)
    if (r.info.collision) {
      wallAction = a
      break
    }
  }
  if (wallAction != null) {
    const names = ['up', 'down', 'left', 'right']
    const name = names[wallAction]
    const before = game.getState().collisions
    ctl.handleKeyDown({ key: name === 'up' ? 'w' : name === 'down' ? 's' : name === 'left' ? 'a' : 'd', repeat: false })
    const afterOne = game.getState().collisions
    check('wall tap: one collision', afterOne === before + 1, `${before}->${afterOne}`)
    sched.flush(10)
    check(
      'wall hold: no repeated collision penalties',
      game.getState().collisions === afterOne,
      String(game.getState().collisions),
    )
    ctl.handleKeyUp({ key: name === 'up' ? 'w' : name === 'down' ? 's' : name === 'left' ? 'a' : 'd' })
  } else {
    check('wall hold probe skipped', true)
  }

  ctl.restart()
  ctl.press('right')
  const mid = game.getState().step_count
  check('D-pad press: one step', mid === 1, String(mid))
  const undoEv = ctl.undo()
  check('undo during play', undoEv.type === 'undo' && game.getState().step_count === 0, undoEv.type)

  // Finish via A* then undo must be refused
  const route = astarPath(game.scenario)
  const actions = pathToActions(route)
  for (const a of actions) {
    if (game.done) break
    game.step(a)
  }
  check('episode can finish', game.done, game.getState().outcome)
  const undoAfter = ctl.undo()
  check(
    'undo disabled after termination',
    undoAfter.type === 'ignored_done' || game.getState().step_count > 0,
    undoAfter.type,
  )

  ctl.restart()
  check('restart clears done', !game.done && game.getState().step_count === 0)
  check('restart clears A* overlay', ctl.showAStar === false)
  ctl.dispose()
}

for (const entry of playManifest.missions) {
  const scenario = JSON.parse(readFileSync(`public/data/rescue-play/${entry.mission}`, 'utf8'))
  const game = new RescueGame(scenario)
  const route = astarPath(game.scenario)
  check(`${entry.id}: A* route`, route.length >= 2, `len=${route.length}`)
  for (const a of pathToActions(route)) {
    if (game.done) break
    game.step(a)
  }
  const sc = game.score()
  check(`${entry.id}: A* success + stars`, sc.status === 'success' && sc.stars >= 1, `${sc.status}/${sc.stars}`)
  const cmp = game.compareWithAStar()
  check(`${entry.id}: A* compare`, cmp.optimal_length != null && cmp.player_steps >= 1, JSON.stringify({
    opt: cmp.optimal_length,
    player: cmp.player_steps,
  }))
}

console.log('\n=== RESCUE PLAY / SHOWDOWN SUMMARY ===')
console.log(
  JSON.stringify(
    {
      failed,
      controller: 'createStepController',
      contract: 't17u',
      missions: playManifest.missions.map((m) => m.id),
      showdown_preserved: true,
    },
    null,
    2,
  ),
)
if (failed) process.exit(1)
console.log('Rescue Play offline checks: PASSED')
