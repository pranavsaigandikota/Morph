#!/usr/bin/env node
/**
 * Default `npm run dev`: Vite only, pointing at Codex Waypoint (:8000).
 * Optionally starts the protocol mock when USE_MOCK_ENGINE=1 or --mock.
 *
 * Cloud / offline: USE_MOCK_ENGINE=1 npm run dev
 * Windows + Codex:  npm run dev   (Waypoint already on :8000)
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const REAL = process.env.VITE_WORLD_API_BASE_URL || 'http://127.0.0.1:8000'
const MOCK = 'http://127.0.0.1:4822'
const wantMock =
  process.env.USE_MOCK_ENGINE === '1' ||
  process.argv.includes('--mock') ||
  process.env.npm_config_mock === 'true'

async function probe(url) {
  try {
    const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(800) }).catch(() =>
      fetch(`${url}/health`, { signal: AbortSignal.timeout(800) }),
    )
    return r.ok
  } catch {
    return false
  }
}

const children = []

function track(child) {
  children.push(child)
  return child
}

function shutdown(code = 0) {
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {
      /* */
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

let engineTarget = REAL
const realUp = await probe(REAL)

if (wantMock || !realUp) {
  console.warn(
    realUp
      ? `[dev] USE_MOCK_ENGINE=1 — starting protocol mock on ${MOCK}`
      : `[dev] ${REAL} not reachable — starting protocol mock on ${MOCK}`,
  )
  track(
    spawn('npx', ['tsx', 'server/index.ts'], {
      stdio: 'inherit',
      env: process.env,
    }),
  )
  await sleep(700)
  engineTarget = MOCK
} else {
  console.log(`[dev] Codex Waypoint reachable at ${REAL}`)
}

console.log(`[dev] ENGINE_TARGET / proxy → ${engineTarget}`)
console.log(`[dev] VITE_WORLD_API_BASE_URL default ${REAL}`)

const vite = track(
  spawn('npx', ['vite'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ENGINE_TARGET: engineTarget,
      VITE_WORLD_API_BASE_URL: process.env.VITE_WORLD_API_BASE_URL || REAL,
    },
  }),
)

vite.on('exit', (code) => shutdown(code ?? 0))
