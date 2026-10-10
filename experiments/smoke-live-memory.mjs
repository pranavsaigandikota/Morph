// GPU smoke test for World Memory API v1.1 (guided manual calibration path) against :8002.
// Usage: node experiments/smoke-live-memory.mjs [scene_id]
// Real Waypoint frames only; writes a JSON report under experiments/backend/results/ (gitignored).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:8002'
const SCENE = process.argv[2] || '9bda60c5d71a411680f71969c487684d' // human-approved Florida SDXL HIGH seed
const report = { started_at: new Date().toISOString(), scene_id: SCENE, checks: [], events: [], frames: 0, errors: [] }
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + JSON.stringify(detail) : ''}`) }

async function call(path, init) {
  const r = await fetch(BASE + path, init)
  const text = await r.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status, body }
}
const post = (path, body) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const MEMORY_EVENTS = new Set(['navigation_update', 'checkpoint_saved', 'checkpoint_updated', 'recovery_started', 'recovery_completed', 'recovery_failed'])
let ws, sid, pending = null, frameEpoch = -1, announcedEpoch = -1, seq = 0, mouseDx = 0, firstFrameAt = 0, steadyFrames = 0
const clock = performance.now()

async function waitFor(pred, ms, label) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await sleep(100) }
  throw new Error(`timeout: ${label}`)
}

function connect() {
  ws = new WebSocket(`ws://127.0.0.1:8002/world/stream?session_id=${sid}`)
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data)
      if (m.type === 'frame') { pending = m; return }
      if (m.type === 'status' && m.epoch != null) announcedEpoch = Math.max(announcedEpoch, m.epoch)
      if (MEMORY_EVENTS.has(m.type)) report.events.push({ type: m.type, epoch: m.epoch, announced_epoch: announcedEpoch, frame_epoch: frameEpoch, event_seq: m.event_seq })
      if (m.type === 'error') report.errors.push(m)
      return
    }
    if (!pending) { report.errors.push('binary without frame metadata'); return }
    const m = pending; pending = null
    report.frames++; if (!firstFrameAt) firstFrameAt = performance.now(); else steadyFrames++
    frameEpoch = m.epoch; announcedEpoch = Math.max(announcedEpoch, m.epoch)
    report.last_dims = [m.width, m.height]
    ws.send(JSON.stringify({ type: 'display_ack', frame_id: m.frame_id, epoch: m.epoch, client_elapsed_ms: performance.now() - clock }))
  }
  ws.onerror = (e) => report.errors.push(String(e.message || e))
  setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'control', seq: ++seq, keys: [], mouse_dx: mouseDx, mouse_dy: 0, timestamp_ms: performance.now() - clock }))
  }, 50)
}

const calId = 'smoke' + Date.now().toString(36)
const calSave = (soft_label, kind = 'capture') => post('/world/checkpoints/save', { session_id: sid, label: `calibration:${calId}:${kind}:${soft_label}`, capture_reason: 'calibration', calibration: { calibration_id: calId, kind, soft_label } })
const nav = async () => (await call(`/world/navigation?session_id=${sid}&trajectory_since=0`)).body

try {
  const health = (await call('/health')).body
  check('health: native 720p model + v1.1 capabilities', health.model === 'Overworld/Waypoint-1.5-1B' && health.contract === 'world-memory-v1.1' && health.capabilities?.calibration_capture === true && health.capabilities?.calibration_backend === false, { model: health.model, contract: health.contract, status: health.status })

  const scene = await call(`/scenes/${SCENE}`)
  const start = await post('/world/start', scene.body.world_start_request)
  sid = start.body.session_id
  check('world start', start.status === 200 && sid, start.body)
  connect()
  await waitFor(() => report.frames >= 20, 180000, 'first 20 frames')
  check('frames are native 1280x720', report.last_dims?.[0] === 1280 && report.last_dims?.[1] === 720, report.last_dims)

  // Guided manual calibration: player holds still, capture; turns, holds still, capture.
  await sleep(1500)
  const fwd = await calSave('forward')
  check('calibration capture (forward) saved', fwd.status === 200 && fwd.body.capture_reason === 'calibration' && fwd.body.calibration?.soft_label === 'forward', { status: fwd.status })
  check('calibration capture is not anchor-approved', fwd.body.quality?.reviewed === false && fwd.body.quality?.approved === false)
  mouseDx = 4; await sleep(2000); mouseDx = 0; await sleep(1500)
  const right = await calSave('right')
  check('calibration capture (right) saved', right.status === 200 && right.body.calibration?.soft_label === 'right', { status: right.status, nominal_yaw_rad: right.body.navigation?.yaw })

  const bad1 = await post('/world/checkpoints/save', { session_id: sid, calibration: { calibration_id: calId, soft_label: 'left' } })
  const bad2 = await post('/world/checkpoints/save', { session_id: sid, capture_reason: 'calibration', calibration: { calibration_id: calId, soft_label: '90deg' } })
  check('invalid calibration requests rejected (422)', bad1.status === 422 && bad2.status === 422, [bad1.status, bad2.status])

  const img = await fetch(BASE + fwd.body.image_url)
  const sha = createHash('sha256').update(Buffer.from(await img.arrayBuffer())).digest('hex')
  check('raw image SHA-256 matches server value', sha === fwd.body.image_sha256, { content_type: img.headers.get('content-type') })

  const n0 = await nav()
  check('light navigation read', n0.trajectory_total >= 1 && Array.isArray(n0.trajectory) && n0.nav_model?.turn_gain === 'not_established', { total: n0.trajectory_total, offset: n0.trajectory_offset, anchor: n0.navigation?.anchor_kind })
  const nTail = (await call(`/world/navigation?session_id=${sid}&trajectory_since=${n0.trajectory_total}`)).body
  check('incremental navigation read returns only new points', nTail.trajectory.length <= 2, { returned: nTail.trajectory.length })

  const rev = await post(`/world/checkpoints/${fwd.body.checkpoint_id}/review`, { session_id: sid, approved: true, reviewer: 'smoke-test', reason: 'clear start view' })
  check('review approves anchor with metadata', rev.body.quality?.approved === true && rev.body.review?.reason === 'clear start view')
  const unreviewed = await post('/world/checkpoints/restore', { session_id: sid, checkpoint_id: right.body.checkpoint_id, variant: 'raw' })
  check('unreviewed calibration capture cannot restore (409)', unreviewed.status === 409, unreviewed.status)

  const before = frameEpoch
  const restore = await post('/world/checkpoints/restore', { session_id: sid, checkpoint_id: fwd.body.checkpoint_id, variant: 'raw' })
  check('restore approved anchor', restore.status === 200 && restore.body.epoch === before + 1, restore.body)
  await waitFor(() => frameEpoch >= restore.body.epoch, 30000, 'frame after restore')
  const n1 = (await nav()).navigation
  check('restored segment anchor', n1.anchor_kind === 'checkpoint_restore' && n1.restored_from_checkpoint_id === fwd.body.checkpoint_id && n1.segment_id !== n0.navigation.segment_id, { anchor: n1.anchor_kind })

  const reset = await post('/world/reset', { session_id: sid })
  await waitFor(() => frameEpoch >= reset.body.epoch, 30000, 'frame after reset')
  const snap = (await call(`/world/memory?session_id=${sid}`)).body
  const seedId = snap.checkpoints[0].checkpoint_id
  check('reset segment anchor', snap.navigation.anchor_kind === 'reset_to_seed' && snap.navigation.restored_from_checkpoint_id === seedId && snap.navigation.segment_id !== n1.segment_id, { epoch: snap.epoch })
  check('capture reasons in snapshot', ['initial_seed', 'calibration'].every((r) => snap.checkpoints.some((c) => c.capture_reason === r)), snap.checkpoints.map((c) => c.capture_reason))

  // K3 from the client side: no memory event may carry an epoch older than one already announced.
  const stale = report.events.filter((e) => e.epoch < e.announced_epoch)
  check('no stale-epoch memory events', stale.length === 0, { events: report.events.length, stale: stale.length })
  check('memory events observed on stream', ['navigation_update', 'checkpoint_saved', 'recovery_started', 'recovery_completed'].every((t) => report.events.some((e) => e.type === t)))
  report.received_fps_after_first_frame = steadyFrames / ((performance.now() - firstFrameAt) / 1000)
  check('no stream errors', report.errors.length === 0, report.errors.slice(0, 3))
} catch (err) {
  report.errors.push(String(err.stack || err))
  check('smoke completed without exception', false, String(err))
} finally {
  if (sid) await post('/world/stop', { session_id: sid }).catch(() => {})
  try { ws?.close() } catch {}
  report.finished_at = new Date().toISOString()
  report.passed = report.checks.every((c) => c.ok)
  const dir = new URL('./backend/results/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  const file = new URL(`smoke-live-memory-${Date.now()}.json`, dir)
  writeFileSync(file, JSON.stringify(report, null, 2))
  console.log(`\n${report.passed ? 'ALL PASSED' : 'FAILURES PRESENT'}; frames=${report.frames}; report=${file.pathname}`)
  process.exit(report.passed ? 0 : 1)
}
