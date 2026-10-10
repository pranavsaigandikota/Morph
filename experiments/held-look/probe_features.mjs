// GPU probe for v1.2 features over the real WebSocket path: idle hold, Shift sprint, clear-view anchors.
// Usage: node experiments/held-look/probe_features.mjs <out_dir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:8002'
const SCENES = { florida: '9bda60c5d71a411680f71969c487684d', city: 'a28daf2205e1449f8810f30e3a7b9909' }
const out = process.argv[2]; mkdirSync(out, { recursive: true })
const report = { started_at: new Date().toISOString(), idle: [], sprint: [], anchors: [], errors: [] }
const clock = performance.now(), now = () => performance.now() - clock
async function call(p, init) { const r = await fetch(BASE + p, init); const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }; return { status: r.status, body: b } }
const post = (p, b) => call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
async function waitFor(pred, ms, label) { const e = Date.now() + ms; while (Date.now() < e) { if (pred()) return; await sleep(20) } throw new Error('timeout ' + label) }

let ws, sid, pending = null, epoch = -1, seq = 0, keys = [], mouseDx = 0, frames = [], rec = null, timer
function connect() {
  ws = new WebSocket(`ws://127.0.0.1:8002/world/stream?session_id=${sid}`); ws.binaryType = 'arraybuffer'
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); if (m.type === 'frame') pending = m; else if (m.type === 'error') report.errors.push(m); return }
    const m = pending; pending = null; if (!m) return
    epoch = Math.max(epoch, m.epoch); frames.push({ t: now(), epoch: m.epoch })
    ws.send(JSON.stringify({ type: 'display_ack', frame_id: m.frame_id, epoch: m.epoch, client_elapsed_ms: now() }))
    if (rec && m.batch_index === m.batch_size - 1 && m.epoch === rec.epoch) {
      const f = `b${String(rec.n++).padStart(3, '0')}.jpg`; writeFileSync(join(rec.dir, f), Buffer.from(ev.data)); rec.files.push({ f, t: now(), batch_id: m.batch_id })
    }
  }
  timer = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'control', seq: ++seq, keys, mouse_dx: mouseDx, mouse_dy: 0, timestamp_ms: now() })) }, 50)
}
async function startWorld(scene) {
  const sc = await call(`/scenes/${scene}`); const st = await post('/world/start', sc.body.world_start_request)
  if (st.status !== 200) throw new Error('start ' + JSON.stringify(st.body)); sid = st.body.session_id; frames = []; connect()
  await waitFor(() => frames.length >= 8, 240000, 'warmup')
}
async function stopWorld() { keys = []; mouseDx = 0; clearInterval(timer); await post('/world/stop', { session_id: sid }); try { ws.close() } catch {}; await sleep(800) }
async function reset() { const r = await post('/world/reset', { session_id: sid }); await waitFor(() => epoch >= r.body.epoch, 30000, 'reset frame'); return r.body.epoch }
const framesBetween = (a, b) => frames.filter((f) => f.t >= a && f.t < b).length

try {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (process.env.PROBE_ONLY === 'anchor' && name !== 'florida') continue
    await startWorld(scene)
    if (process.env.PROBE_ONLY !== 'anchor') {
    // 1. Idle hold: no input for 6 s after a reset; count frames in the last 4 s.
    for (let k = 0; k < 2; k++) {
      await reset(); const t0 = now(); await sleep(6000); const t1 = now()
      report.idle.push({ scene: name, frames_first_2s: framesBetween(t0, t0 + 2000), frames_last_4s: framesBetween(t1 - 4000, t1) })
    }
    // Input wakes generation immediately.
    { const t0 = now(); mouseDx = 8; await sleep(1000); mouseDx = 0; report.idle.push({ scene: name, frames_1s_after_input: framesBetween(t0, t0 + 1000) }) }
    // 2. Sprint: W vs W+Shift, 4 s, two repeats each, interleaved.
    for (const [label, k] of [['walk', ['w']], ['sprint', ['w', 'shift']], ['walk_rep', ['w']], ['sprint_rep', ['w', 'shift']]]) {
      const e = await reset(); const dir = join(out, `${name}-${label}`); mkdirSync(dir, { recursive: true })
      rec = { epoch: e, dir, n: 0, files: [] }; await sleep(600); const t0 = now(); keys = k; await sleep(4000); keys = []; const t1 = now(); await sleep(1200)
      writeFileSync(join(dir, 'trial.json'), JSON.stringify({ label, keys: k, hold_start_ms: t0, hold_end_ms: t1, files: rec.files }, null, 2))
      report.sprint.push({ scene: name, label, batches: rec.files.length }); rec = null
    }
    }
    // 3. Clear-view anchor: walk + look, capture (enhance), walk away, restore the enhanced anchor.
    if (name === 'florida') {
      const e = await reset(); const dir = join(out, 'anchor'); mkdirSync(dir, { recursive: true })
      keys = ['w']; await sleep(2500); keys = []; mouseDx = -8; await sleep(1500); mouseDx = 0; await sleep(800)
      const t0 = now(); const cap = await post('/world/anchors/capture', { session_id: sid, label: 'Probe clear view', strength: 0.35 })
      const t1 = now(); const cp = cap.body.checkpoint
      for (const v of ['raw', 'enhanced']) { const r = await fetch(BASE + (v === 'raw' ? cp.image_url : cp.enhanced_image_url)); writeFileSync(join(dir, `anchor-${v}.${v === 'raw' ? 'jpg' : 'png'}`), Buffer.from(await r.arrayBuffer())) }
      report.anchors.push({ capture_status: cap.status, capture_ms: t1 - t0, frames_during_capture: framesBetween(t0, t1), approved: cp.quality.approved, enhancement: cp.enhancement, pose: cp.navigation })
      keys = ['w']; await sleep(3000); keys = []; await sleep(600)
      const nav = (await call(`/world/navigation?session_id=${sid}`)).body.navigation
      const t2 = now(); const rs = await post('/world/checkpoints/restore', { session_id: sid, checkpoint_id: cp.checkpoint_id, variant: 'enhanced' })
      await waitFor(() => epoch >= rs.body.epoch, 30000, 'restore frame'); const t3 = now()
      rec = { epoch: rs.body.epoch, dir, n: 0, files: [] }; await sleep(2500); rec = null
      const after = (await call(`/world/navigation?session_id=${sid}`)).body.navigation
      report.anchors.push({ walked_away_pose: { x: nav.x, z: nav.z, yaw: nav.yaw }, restore_status: rs.status, restore_to_first_frame_ms: t3 - t2, pose_after_restore: { x: after.x, z: after.z, yaw: after.yaw, anchor_kind: after.anchor_kind } })
      // restore_here variant: capture + immediately continue from the enhanced view.
      const t4 = now(); const here = await post('/world/anchors/capture', { session_id: sid, label: 'Refresh here', restore_here: true }); const t5 = now()
      report.anchors.push({ refresh_here_status: here.status, refresh_here_ms: t5 - t4, restored_epoch: here.body.restored?.epoch })
    }
    await stopWorld()
  }
} catch (err) { report.errors.push(String(err.stack || err)); console.error(err) }
finally {
  try { if (sid) await post('/world/stop', { session_id: sid }) } catch {}
  report.finished_at = new Date().toISOString(); writeFileSync(join(out, 'probe-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ idle: report.idle, anchors: report.anchors, errors: report.errors }, null, 1)); process.exit(0)
}
