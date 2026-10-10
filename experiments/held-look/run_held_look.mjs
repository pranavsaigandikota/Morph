// Sustained held-key look experiment (IJKL feasibility) over the REAL WebSocket control path on :8002.
// A held key is simulated as a constant mouse_dx per 50 ms control tick (what an IJKL mapping would send).
// Usage: node experiments/held-look/run_held_look.mjs <scene_index 1..3> <stage> <out_dir>
// Frames: every batch-last JPEG is saved byte-for-byte as streamed. Applied per-batch mouse comes from the
// server's own batches.jsonl (copied into the trial folder afterwards). No angles are computed here.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:8002'
const SCENES = { 1: '9bda60c5d71a411680f71969c487684d', 2: 'a28daf2205e1449f8810f30e3a7b9909', 3: '5c13cff531cb4bd18f66dd4f57d5f6c0' }
const BACKEND_RESULTS = new URL('../backend/results/', import.meta.url)
const [sceneIndex, stage, outDir] = [Number(process.argv[2]), process.argv[3], process.argv[4]]
if (!SCENES[sceneIndex] || !stage || !outDir) { console.error('usage: <scene 1..3> <stage> <out_dir>'); process.exit(2) }

// strength = mouse_dx per 50 ms tick; dir +1 = right (positive dx), -1 = left. idle = no input control.
const PLANS = {
  stage1: [
    ['idle', 0, 0, 8], ['R28_4', 28, 1, 4], ['R84_4', 84, 1, 4], ['R8_4', 8, 1, 4], ['L84_4', 84, -1, 4],
    ['R84_2', 84, 1, 2], ['R84_8', 84, 1, 8], ['R28_8', 28, 1, 8], ['R84_4_rep', 84, 1, 4], ['L28_4', 28, -1, 4],
  ],
  // Filled in after stage 1 is reviewed; kept small to avoid spending GPU time on every combination.
  // Revised after stage 1 review: focus on medium strength (~frontend max); one strong 8 s hold per scene
  // only to check whether stage-1 degradation repeats. Strong 2 s / 4 s left already characterised.
  stage2: [
    ['idle', 0, 0, 8], ['R28_4', 28, 1, 4], ['L28_4', 28, -1, 4], ['R28_8', 28, 1, 8], ['R28_2', 28, 1, 2],
    ['R84_4', 84, 1, 4], ['R84_8', 84, 1, 8], ['R28_4_rep', 28, 1, 4],
  ],
}
// Full matrix (user confirmed GPU time is not a constraint): independent second pass for coverage + repeatability.
PLANS.full = [['idle', 0, 0, 8]]
for (const st of [8, 28, 84]) for (const d of [2, 4, 8]) for (const [dn, dv] of [['R', 1], ['L', -1]]) PLANS.full.push([`${dn}${st}_${d}`, st, dv, d])
PLANS.full.push(['idle_end', 0, 0, 8])
const plan = PLANS[stage]
if (!plan) { console.error('unknown stage'); process.exit(2) }
const PRE_S = 1.0, POST_S = 2.0

const clock = performance.now()
const now = () => performance.now() - clock
const run = { scene_index: sceneIndex, scene_id: SCENES[sceneIndex], stage, started_at: new Date().toISOString(), trials: [], errors: [] }
mkdirSync(outDir, { recursive: true })

async function call(path, init) { const r = await fetch(BASE + path, init); const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }; return { status: r.status, body: b } }
const post = (path, body) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
async function waitFor(pred, ms, label) { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return; await sleep(20) } throw new Error('timeout: ' + label) }

let ws, sid, pending = null, epoch = -1, seq = 0, mouseDx = 0, trial = null, totalFrames = 0
const sent = [] // per-trial control log

function connect() {
  ws = new WebSocket(`ws://127.0.0.1:8002/world/stream?session_id=${sid}`)
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data)
      if (m.type === 'frame') pending = m
      else if (m.type === 'error') run.errors.push(m)
      return
    }
    const m = pending; pending = null
    if (!m) { run.errors.push('binary without metadata'); return }
    totalFrames++; epoch = Math.max(epoch, m.epoch)
    ws.send(JSON.stringify({ type: 'display_ack', frame_id: m.frame_id, epoch: m.epoch, client_elapsed_ms: now() }))
    if (!trial || m.epoch !== trial.epoch) return
    const t = now()
    trial.frames_received++
    if (trial.first_frame_t == null) trial.first_frame_t = t
    if (m.batch_index === m.batch_size - 1) {
      const name = `b${String(trial.batches.length).padStart(3, '0')}.jpg`
      writeFileSync(join(trial.dir, name), Buffer.from(ev.data))
      trial.batches.push({ file: name, t_recv_ms: t, frame_id: m.frame_id, batch_id: m.batch_id, seq: m.seq, epoch: m.epoch, inference_ms: m.inference_ms, width: m.width, height: m.height })
    }
  }
  ws.onerror = (e) => run.errors.push(String(e.message || e))
  setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return
    const s = ++seq, t = now()
    ws.send(JSON.stringify({ type: 'control', seq: s, keys: [], mouse_dx: mouseDx, mouse_dy: 0, timestamp_ms: t }))
    if (trial) trial.controls.push({ seq: s, t_send_ms: t, mouse_dx: mouseDx })
  }, 50)
}

try {
  const scene = await call(`/scenes/${SCENES[sceneIndex]}`)
  if (scene.status !== 200) throw new Error('scene not found')
  const start = await post('/world/start', scene.body.world_start_request)
  if (start.status !== 200) throw new Error('start failed ' + JSON.stringify(start.body))
  sid = start.body.session_id; run.session_id = sid
  connect()
  await waitFor(() => totalFrames >= 40, 240000, 'warmup frames')

  for (const [name, strength, dir, holdS] of plan) {
    const reset = await post('/world/reset', { session_id: sid })
    if (reset.status !== 200) throw new Error('reset failed ' + JSON.stringify(reset.body))
    const dirPath = join(outDir, `scene${sceneIndex}-${name}`)
    mkdirSync(dirPath, { recursive: true })
    trial = { name, strength_per_tick: strength, direction: dir === 1 ? 'right' : dir === -1 ? 'left' : 'none', hold_s: holdS, epoch: reset.body.epoch, dir: dirPath, batches: [], controls: [], frames_received: 0, first_frame_t: null }
    await waitFor(() => epoch >= trial.epoch && trial.first_frame_t != null, 30000, 'first frame after reset')
    mouseDx = 0; await sleep(PRE_S * 1000)
    trial.hold_start_ms = now(); trial.hold_start_seq = seq + 1
    mouseDx = dir * strength; await sleep(holdS * 1000)
    mouseDx = 0; trial.hold_end_ms = now(); trial.hold_end_seq = seq
    await sleep(POST_S * 1000)
    trial.end_ms = now()
    const { dir: _d, ...meta } = trial
    writeFileSync(join(dirPath, 'trial.json'), JSON.stringify(meta, null, 2))
    run.trials.push({ name, folder: `scene${sceneIndex}-${name}`, epoch: trial.epoch, batches: trial.batches.length })
    console.log(`${name}: epoch ${trial.epoch}, ${trial.batches.length} batch-last frames, ${trial.frames_received} frames`)
    trial = null
  }
} catch (err) {
  run.errors.push(String(err.stack || err)); console.error(err)
} finally {
  mouseDx = 0
  if (sid) await post('/world/stop', { session_id: sid }).catch(() => {})
  try { ws?.close() } catch {}
  await sleep(500)
  const log = new URL(`${sid}/batches.jsonl`, BACKEND_RESULTS)
  if (sid && existsSync(log)) copyFileSync(log, join(outDir, `scene${sceneIndex}-server-batches.jsonl`))
  run.finished_at = new Date().toISOString()
  writeFileSync(join(outDir, `scene${sceneIndex}-run.json`), JSON.stringify(run, null, 2))
  console.log(run.errors.length ? `ERRORS: ${run.errors.length}` : 'done')
  process.exit(run.errors.length ? 1 : 0)
}
