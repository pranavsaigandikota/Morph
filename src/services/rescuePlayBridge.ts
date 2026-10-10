/**
 * Bridge RescueGame SimState → existing RescueScene BuildingMap renderer.
 * Does not reimplement step rules — only visual mapping.
 */
import type { AStarComparison, SimState } from '../lib/rescue-play'
import type { AgentPose, BuildingMap, MapCell } from '../types/simulation'

export function buildingMapFromSim(
  state: SimState,
  id: string,
  name: string,
): BuildingMap {
  const cells: MapCell[] = []
  for (const [x, y] of state.walls) cells.push({ x, y, type: 'wall' })
  for (const [x, y] of state.blocked) cells.push({ x, y, type: 'blocked' })
  for (const [x, y] of state.doors) cells.push({ x, y, type: 'door' })

  return {
    id,
    name,
    width: state.width,
    height: state.height,
    cells,
    walls: [],
    exits: [{ x: state.goal[0], y: state.goal[1], label: 'Goal' }],
    hazards: state.hazards.map(([x, y]) => ({
      x,
      y,
      type: 'chemical' as const,
      intensity: 0.7,
    })),
    spawn: { x: state.start[0], y: state.start[1] },
  }
}

export function agentPoseFromSim(state: SimState): AgentPose {
  const status =
    state.outcome === 'success'
      ? 'success'
      : state.outcome === 'hazard' || state.outcome === 'timeout'
        ? 'failed'
        : state.step_count > 0
          ? 'navigating'
          : 'idle'
  return {
    x: state.agent[0],
    y: state.agent[1],
    heading: 0,
    status,
  }
}

export function cellsToPath(cells: Array<readonly [number, number] | number[]>): Array<{
  x: number
  y: number
}> {
  return cells.map((c) => ({ x: c[0]!, y: c[1]! }))
}

export function playerPathFromState(state: SimState): Array<{ x: number; y: number }> {
  if (!state.trajectory?.length) {
    return [{ x: state.start[0], y: state.start[1] }]
  }
  const path = [{ x: state.start[0], y: state.start[1] }]
  for (const step of state.trajectory) {
    path.push({ x: step.to[0], y: step.to[1] })
  }
  return path
}

export function astarPathFromComparison(
  comparison: AStarComparison | null,
): Array<{ x: number; y: number }> | undefined {
  if (!comparison?.astar_route?.length) return undefined
  return cellsToPath(comparison.astar_route)
}
