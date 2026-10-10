#!/usr/bin/env node
/**
 * Automated mock-mode protocol checks (cloud / CI).
 * Does NOT replace Windows GPU validation against real Codex Waypoint.
 */
import WebSocket from 'ws'

const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:4822'
const WS_URL = ENGINE.replace(/^http/, 'ws') + '/stream'

function parseEnvelope(buf) {
  let p = 0
  const hlen = buf.readUInt32LE(p)
  p += 4
  const header = JSON.parse(buf.subarray(p, p + hlen).toString('utf8'))
  p += hlen
  const sub = buf.readUInt32LE(p)
  p += 4
  const jpegs = []
  for (let i = 0; i < sub; i++) {
    const jl = buf.readUInt32LE(p)
    p += 4
    jpegs.push(buf.subarray(p, p + jl))
    p += jl
  }
  return { header, jpegs }
}

function isJpeg(b) {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  // 1. Health
  let healthOk = false
  for (const path of ['/healthz', '/readyz', '/status']) {
    try {
      const r = await fetch(ENGINE + path)
      if (r.ok) {
        healthOk = true
        check(`GET ${path}`, true, JSON.stringify(await r.json()).slice(0, 120))
        break
      }
    } catch {
      /* */
    }
  }
  check('Engine reachable', healthOk, ENGINE)
  if (!healthOk) {
    console.error('\nStart mock: npm run mock')
    process.exit(2)
  }

  const stats = {
    hello: null,
    batches: 0,
    frames: 0,
    badJpeg: 0,
    frameIds: [],
    controlsAcked: 0,
  }

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.binaryType = 'nodebuffer'
    const t0 = Date.now()

    ws.on('open', () => {
      const iv = setInterval(() => {
        ws.send(
          JSON.stringify({
            type: 'control',
            buttons: ['W'],
            dx: 0.1,
            dy: -0.05,
            scroll: 0,
            ts: Date.now(),
          }),
        )
        stats.controlsAcked++
        if (Date.now() - t0 > 4000) {
          clearInterval(iv)
          ws.close()
        }
      }, 33)
    })

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        const m = JSON.parse(data.toString())
        if (m.type === 'hello') stats.hello = m
        return
      }
      try {
        const { header, jpegs } = parseEnvelope(Buffer.from(data))
        stats.batches++
        stats.frames += jpegs.length
        stats.frameIds.push(header.frame_id)
        for (const j of jpegs) if (!isJpeg(j)) stats.badJpeg++
        if (!('gen_ms' in header) || !('temporal_compression' in header)) {
          check('FrameHeader fields', false, JSON.stringify(header))
        }
      } catch (e) {
        check('Envelope parse', false, e.message)
      }
    })

    ws.on('error', reject)
    ws.on('close', resolve)
    setTimeout(() => {
      try {
        ws.close()
      } catch {
        /* */
      }
      resolve()
    }, 6000)
  })

  check('hello.type === hello', stats.hello?.type === 'hello', JSON.stringify(stats.hello))
  check('hello has session_id', !!stats.hello?.session_id)
  check('hello has width/height', !!(stats.hello?.width && stats.hello?.height))
  check(
    'hello.temporal_compression',
    typeof stats.hello?.temporal_compression === 'number',
    String(stats.hello?.temporal_compression),
  )
  check('hello.mock === true (mock engine)', stats.hello?.mock === true)
  check('Received binary batches', stats.batches >= 4, `batches=${stats.batches}`)
  check('JPEG sub-frames', stats.frames >= 16, `frames=${stats.frames}`)
  check('All JPEGs valid SOI', stats.badJpeg === 0, `bad=${stats.badJpeg}`)
  check('Controls sent', stats.controlsAcked >= 30, `n=${stats.controlsAcked}`)

  // Frame-id monotonic (non-decreasing by temporal step)
  let gaps = 0
  for (let i = 1; i < stats.frameIds.length; i++) {
    if (stats.frameIds[i] < stats.frameIds[i - 1]) gaps++
  }
  check('frame_id non-decreasing', gaps === 0, `regressions=${gaps}`)

  const failed = results.filter((r) => !r.ok)
  console.log('\n=== MOCK PROTOCOL SUMMARY ===')
  console.log(JSON.stringify({ engine: ENGINE, passed: results.length - failed.length, failed: failed.length, stats }, null, 2))
  if (failed.length) {
    console.error('\nWorld Explorer mock protocol: INCOMPLETE')
    process.exit(1)
  }
  console.log('\nWorld Explorer mock protocol: PASSED')
  console.log('Still required: Windows GPU validation against real :8000 (WASD + mouse).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
