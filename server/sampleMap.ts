import type { BuildingMap } from '../src/types/simulation.ts'

/** Deterministic research-facility floor plan for the rescue simulator. */
export const FACILITY_MAP: BuildingMap = {
  id: 'facility_a',
  name: 'Research Facility A — Sublevel 2',
  width: 24,
  height: 18,
  spawn: { x: 2, y: 9 },
  cells: [],
  walls: [],
  exits: [
    { x: 22, y: 2, label: 'Exit North' },
    { x: 22, y: 15, label: 'Exit South' },
  ],
  hazards: [
    { x: 8, y: 8, type: 'fire', intensity: 0.8 },
    { x: 9, y: 8, type: 'fire', intensity: 0.6 },
    { x: 8, y: 9, type: 'smoke', intensity: 0.7 },
    { x: 14, y: 4, type: 'chemical', intensity: 0.5 },
    { x: 15, y: 12, type: 'collapse', intensity: 0.9 },
  ],
}

function buildMap(): BuildingMap {
  const map: BuildingMap = {
    ...FACILITY_MAP,
    cells: [],
    walls: [],
  }

  const blocked = new Set<string>()
  const wallRects: Array<[number, number, number, number]> = [
    [0, 0, 23, 0],
    [0, 17, 23, 17],
    [0, 0, 0, 17],
    [23, 0, 23, 17],
    // Interior partitions
    [5, 1, 5, 6],
    [5, 11, 5, 16],
    [11, 3, 11, 8],
    [11, 10, 11, 14],
    [17, 1, 17, 5],
    [17, 12, 17, 16],
    [1, 5, 4, 5],
    [6, 5, 10, 5],
    [12, 9, 16, 9],
    [18, 8, 22, 8],
  ]

  for (const [x1, y1, x2, y2] of wallRects) {
    map.walls.push({ x1, y1, x2, y2 })
    const dx = Math.sign(x2 - x1) || 0
    const dy = Math.sign(y2 - y1) || 0
    let x = x1
    let y = y1
    while (true) {
      blocked.add(`${x},${y}`)
      if (x === x2 && y === y2) break
      x += dx
      y += dy
    }
  }

  const hazardAt = new Map(map.hazards.map((h) => [`${h.x},${h.y}`, h]))
  const exitAt = new Set(map.exits.map((e) => `${e.x},${e.y}`))

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = `${x},${y}`
      if (blocked.has(key)) {
        map.cells.push({ x, y, type: 'wall' })
      } else if (exitAt.has(key)) {
        map.cells.push({ x, y, type: 'exit' })
      } else if (hazardAt.has(key)) {
        const h = hazardAt.get(key)!
        map.cells.push({ x, y, type: 'hazard', hazard: h.type })
      } else if (x === map.spawn.x && y === map.spawn.y) {
        map.cells.push({ x, y, type: 'spawn' })
      } else {
        map.cells.push({ x, y, type: 'floor' })
      }
    }
  }

  return map
}

export const SAMPLE_MAP = buildMap()
