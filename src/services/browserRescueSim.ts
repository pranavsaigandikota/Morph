/**
 * Browser-side rescue mission stepper — same map schema as the static Rescue package.
 * Walls block, hazards register hits, reaching any exit wins.
 * No live PPO / Grok service required.
 */
import type { AgentPose, BuildingMap } from '../types/simulation'

export type RescueMove = 'N' | 'S' | 'E' | 'W'

export interface RescueMissionState {
  map: BuildingMap
  agent: AgentPose
  step: number
  collisions: number
  hazardHits: number
  path: Array<{ x: number; y: number }>
  status: 'ready' | 'playing' | 'success' | 'failed'
  maxSteps: number
  message: string
}

const DELTA: Record<RescueMove, { dx: number; dy: number; heading: number }> = {
  N: { dx: 0, dy: -1, heading: -Math.PI / 2 },
  S: { dx: 0, dy: 1, heading: Math.PI / 2 },
  E: { dx: 1, dy: 0, heading: 0 },
  W: { dx: -1, dy: 0, heading: Math.PI },
}

function wallSet(map: BuildingMap): Set<string> {
  const s = new Set<string>()
  for (const c of map.cells) {
    if (c.type === 'wall') s.add(`${c.x},${c.y}`)
  }
  return s
}

function hazardAt(map: BuildingMap, x: number, y: number) {
  return map.hazards.find((h) => h.x === x && h.y === y)
}

function isBlocked(map: BuildingMap, walls: Set<string>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true
  return walls.has(`${x},${y}`)
}

export function createMission(map: BuildingMap, maxSteps = 120): RescueMissionState {
  const spawn = map.spawn
  return {
    map,
    agent: { x: spawn.x, y: spawn.y, heading: 0, status: 'idle' },
    step: 0,
    collisions: 0,
    hazardHits: 0,
    path: [{ x: spawn.x, y: spawn.y }],
    status: 'ready',
    maxSteps,
    message: 'Reach a green exit. Avoid walls and hazards.',
  }
}

export function stepMission(state: RescueMissionState, move: RescueMove): RescueMissionState {
  if (state.status === 'success' || state.status === 'failed') return state

  const walls = wallSet(state.map)
  const d = DELTA[move]
  const nx = state.agent.x + d.dx
  const ny = state.agent.y + d.dy

  if (isBlocked(state.map, walls, nx, ny)) {
    return {
      ...state,
      status: 'playing',
      collisions: state.collisions + 1,
      agent: { ...state.agent, heading: d.heading, status: 'navigating' },
      message: 'Blocked — wall or boundary',
    }
  }

  const step = state.step + 1
  let hazardHits = state.hazardHits
  const hz = hazardAt(state.map, nx, ny)
  if (hz) hazardHits += 1

  const atExit = state.map.exits.some((e) => e.x === nx && e.y === ny)
  const path = [...state.path, { x: nx, y: ny }]

  if (atExit) {
    return {
      ...state,
      step,
      hazardHits,
      path,
      status: 'success',
      agent: { x: nx, y: ny, heading: d.heading, status: 'success' },
      message: `Exit reached in ${step} steps`,
    }
  }

  if (step >= state.maxSteps) {
    return {
      ...state,
      step,
      hazardHits,
      path,
      status: 'failed',
      agent: { x: nx, y: ny, heading: d.heading, status: 'failed' },
      message: 'Out of steps — mission failed',
    }
  }

  return {
    ...state,
    step,
    hazardHits,
    path,
    status: 'playing',
    agent: {
      x: nx,
      y: ny,
      heading: d.heading,
      status: hz ? 'rescuing' : 'navigating',
    },
    message: hz ? `Hazard (${hz.type}) — keep moving` : 'Navigating…',
  }
}

export function keyToMove(code: string): RescueMove | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'N'
    case 'KeyS':
    case 'ArrowDown':
      return 'S'
    case 'KeyA':
    case 'ArrowLeft':
      return 'W'
    case 'KeyD':
    case 'ArrowRight':
      return 'E'
    default:
      return null
  }
}

/** Orthogonal A* on the facility grid (walls blocked). */
export function astarPath(
  map: BuildingMap,
  start: { x: number; y: number },
  goal: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const walls = wallSet(map)
  const key = (x: number, y: number) => `${x},${y}`
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y)

  type Node = { x: number; y: number; g: number; f: number }
  const open = new Map<string, Node>()
  const came = new Map<string, string>()
  const closed = new Set<string>()
  const sk = key(start.x, start.y)
  open.set(sk, { x: start.x, y: start.y, g: 0, f: h(start.x, start.y) })

  while (open.size) {
    let bestK = ''
    let best: Node | null = null
    for (const [k, n] of open) {
      if (!best || n.f < best.f) {
        best = n
        bestK = k
      }
    }
    if (!best) break
    open.delete(bestK)

    if (best.x === goal.x && best.y === goal.y) {
      const path: Array<{ x: number; y: number }> = [{ x: best.x, y: best.y }]
      let cur = bestK
      while (came.has(cur)) {
        cur = came.get(cur)!
        const [xs, ys] = cur.split(',')
        path.push({ x: Number(xs), y: Number(ys) })
      }
      return path.reverse()
    }

    closed.add(bestK)
    for (const move of Object.values(DELTA)) {
      const nx = best.x + move.dx
      const ny = best.y + move.dy
      if (isBlocked(map, walls, nx, ny)) continue
      const nk = key(nx, ny)
      if (closed.has(nk)) continue
      const g = best.g + 1
      const prev = open.get(nk)
      if (!prev || g < prev.g) {
        came.set(nk, bestK)
        open.set(nk, { x: nx, y: ny, g, f: g + h(nx, ny) })
      }
    }
  }
  return []
}

export function shortestExitPath(map: BuildingMap): Array<{ x: number; y: number }> {
  let best: Array<{ x: number; y: number }> = []
  for (const exit of map.exits) {
    const p = astarPath(map, map.spawn, exit)
    if (p.length && (!best.length || p.length < best.length)) best = p
  }
  return best
}
