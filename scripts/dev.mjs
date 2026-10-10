#!/usr/bin/env node
/**
 * Boots mock API + Vite. Prefers Codex Waypoint at :8000 for /engine;
 * falls back to the local protocol-compatible mock on :4822 when :8000 is down.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const REAL = 'http://127.0.0.1:8000'
const MOCK = 'http://127.0.0.1:4822'

async function probe(url) {
  try {
    const ctrl = AbortSignal.timeout(800)
    const r = await fetch(`${url}/healthz`, { signal: ctrl }).catch(() =>
      fetch(`${url}/health`, { signal: AbortSignal.timeout(800) }),
    )
    return r.ok
  } catch {
    return false
  }
}

const mock = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: process.env,
})

await sleep(600)

let engineTarget = MOCK
let label = 'MOCK Waypoint protocol (:4822)'
if (await probe(REAL)) {
  engineTarget = REAL
  label = 'REAL Codex Waypoint (:8000)'
} else {
  console.warn(`[dev] ${REAL} not reachable — using protocol mock at ${MOCK}`)
  console.warn('[dev] Start the Waypoint backend on :8000 and restart to use real frames.')
}

console.log(`[dev] ENGINE_TARGET → ${label}`)

const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  env: { ...process.env, ENGINE_TARGET: engineTarget },
})

const stop = () => {
  mock.kill('SIGTERM')
  vite.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

vite.on('exit', (code) => {
  mock.kill('SIGTERM')
  process.exit(code ?? 0)
})
mock.on('exit', (code) => {
  if (code && code !== 0) {
    console.error('[dev] mock server exited', code)
    vite.kill('SIGTERM')
    process.exit(code)
  }
})
