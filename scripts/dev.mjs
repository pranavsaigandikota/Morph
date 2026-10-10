#!/usr/bin/env node
/**
 * Default `npm run dev`: Vite only, targeting Codex Waypoint (:8000).
 *
 * Does NOT silently fall back to the protocol mock when :8000 is down.
 * Explicit mock only via:
 *   USE_MOCK_ENGINE=1 npm run dev
 *   npm run dev -- --mock
 *   npm run dev:mock
 *
 * Windows + Codex: start Waypoint on :8000, then `npm run dev`.
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

if (wantMock) {
  console.warn(`[dev] Explicit mock requested — starting protocol mock on ${MOCK}`)
  track(
    spawn('npx', ['tsx', 'server/index.ts'], {
      stdio: 'inherit',
      env: process.env,
    }),
  )
  await sleep(700)
  engineTarget = MOCK
} else if (!realUp) {
  console.error(`[dev] WARNING: Codex Waypoint not reachable at ${REAL}`)
  console.error('[dev] World Explorer will show a connection error (no silent mock fallback).')
  console.error('[dev] Start Codex on :8000, or run explicitly: npm run dev:mock')
  engineTarget = REAL
} else {
  console.log(`[dev] Codex Waypoint reachable at ${REAL}`)
}

console.log(`[dev] ENGINE_TARGET / proxy → ${engineTarget}`)
console.log(`[dev] VITE_WORLD_API_BASE_URL=${process.env.VITE_WORLD_API_BASE_URL || REAL}`)

const vite = track(
  spawn('npx', ['vite'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ENGINE_TARGET: process.env.ENGINE_TARGET || engineTarget,
      VITE_WORLD_API_BASE_URL: process.env.VITE_WORLD_API_BASE_URL || REAL,
    },
  }),
)

vite.on('exit', (code) => shutdown(code ?? 0))
