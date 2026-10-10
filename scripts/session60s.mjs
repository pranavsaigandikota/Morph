#!/usr/bin/env node
/**
 * 60-second Waypoint navigation session with changing controls.
 * Measures generated FPS (JPEG sub-frames), display-equivalent receive rate,
 * latency via client_ts echo, and dropped/invalid envelopes.
 *
 * Usage:
 *   ENGINE_URL=http://127.0.0.1:8000 npm run test:stream60
 *   ENGINE_URL=http://127.0.0.1:4822 npm run test:stream60   # protocol mock
 */
import WebSocket from 'ws'

const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:8000'
const DURATION_MS = Number(process.env.DURATION_MS || 60_000)
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

const patterns = [
  { buttons: ['W'], dx: 0, dy: 0, label: 'forward' },
  { buttons: ['W', 'D'], dx: 0.15, dy: 0, label: 'forward+strafe+look' },
  { buttons: ['A'], dx: -0.2, dy: 0.05, label: 'strafe left look' },
  { buttons: ['S'], dx: 0.1, dy: -0.1, label: 'back look' },
  { buttons: ['W', 'SHIFT'], dx: 0, dy: 0, label: 'sprint' },
  { buttons: ['SPACE'], dx: 0, dy: 0.2, label: 'jump look-up' },
  { buttons: [], dx: 0.35, dy: 0, label: 'look only' },
  { buttons: ['W', 'A'], dx: -0.1, dy: 0, label: 'diagonal' },
]

async function main() {
  // Prefer healthz
  let health = null
  for (const path of ['/healthz', '/readyz', '/status', '/health']) {
    try {
      const r = await fetch(ENGINE + path)
      if (r.ok) {
        health = { path, body: await r.json() }
        break
      }
    } catch {
      /* try next */
    }
  }
  if (!health) {
    console.error(`FAIL: engine unreachable at ${ENGINE}`)
    process.exit(2)
  }
  console.log('engine health', health)

  const stats = {
    batches: 0,
    frames: 0,
    badJpeg: 0,
    badEnvelope: 0,
    latSamples: [],
    genMs: [],
    controlsSent: 0,
    hello: null,
  }

  const t0 = Date.now()
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.binaryType = 'nodebuffer'
    let patternIdx = 0
    let controlTimer = null
    let done = false

    const finish = () => {
      if (done) return
      done = true
      clearInterval(controlTimer)
      try {
        ws.close()
      } catch {
        /* */
      }
      resolve()
    }

    ws.on('open', () => {
      console.log('WS open', WS_URL)
      controlTimer = setInterval(() => {
        const elapsed = Date.now() - t0
        if (elapsed >= DURATION_MS) {
          finish()
          return
        }
        patternIdx = Math.floor(elapsed / 7500) % patterns.length
        const p = patterns[patternIdx]
        ws.send(
          JSON.stringify({
            type: 'control',
            buttons: p.buttons,
            dx: p.dx,
            dy: p.dy,
            scroll: 0,
            ts: performance.now ? performance.now() : Date.now(),
          }),
        )
        stats.controlsSent++
        if (stats.controlsSent % 90 === 1) {
          console.log(
            `t=${(elapsed / 1000).toFixed(1)}s pattern=${p.label} frames=${stats.frames}`,
          )
        }
      }, 33)
    })

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const m = JSON.parse(data.toString())
          if (m.type === 'hello') {
            stats.hello = m
            console.log('hello', m)
          } else if (m.type === 'error') {
            console.error('server error', m)
          }
        } catch {
          /* */
        }
        return
      }
      try {
        const { header, jpegs } = parseEnvelope(Buffer.from(data))
        stats.batches++
        stats.frames += jpegs.length
        if (typeof header.gen_ms === 'number') stats.genMs.push(header.gen_ms)
        if (header.client_ts > 0) {
          const now = performance.now ? performance.now() : Date.now()
          stats.latSamples.push(now - header.client_ts)
        }
        for (const j of jpegs) {
          if (!isJpeg(j)) stats.badJpeg++
        }
      } catch (e) {
        stats.badEnvelope++
        console.warn('bad envelope', e.message)
      }
    })

    ws.on('error', (err) => {
      console.error('WS error', err.message)
      if (!stats.hello) reject(err)
    })
    ws.on('close', () => finish())
    setTimeout(finish, DURATION_MS + 2000)
  })

  const elapsedSec = (Date.now() - t0) / 1000
  const genFps = stats.frames / elapsedSec
  const batchFps = stats.batches / elapsedSec
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  const p95 = (arr) => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length * 0.95)]
  }

  const report = {
    engine: ENGINE,
    duration_s: Math.round(elapsedSec * 10) / 10,
    hello: stats.hello,
    generated_fps: Math.round(genFps * 100) / 100,
    batch_fps: Math.round(batchFps * 100) / 100,
    total_jpeg_frames: stats.frames,
    total_batches: stats.batches,
    controls_sent: stats.controlsSent,
    bad_jpeg: stats.badJpeg,
    bad_envelope: stats.badEnvelope,
    gen_ms_avg: avg(stats.genMs) != null ? Math.round(avg(stats.genMs) * 10) / 10 : null,
    latency_ms_avg: avg(stats.latSamples) != null ? Math.round(avg(stats.latSamples)) : null,
    latency_ms_p95: p95(stats.latSamples) != null ? Math.round(p95(stats.latSamples)) : null,
    mock: !!(stats.hello && stats.hello.mock),
    protocol: 'Waypoint Phase-2 binary envelope on WS /stream',
  }

  console.log('\n=== 60s SESSION REPORT ===')
  console.log(JSON.stringify(report, null, 2))

  if (stats.frames < 10) {
    console.error('FAIL: too few frames')
    process.exit(1)
  }
  if (stats.badEnvelope > stats.batches * 0.05) {
    console.error('FAIL: too many bad envelopes')
    process.exit(1)
  }
  console.log('PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
