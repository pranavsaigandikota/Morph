import type { WorldScene } from '../types/world'

export const WORLD_SCENES: WorldScene[] = [
  {
    id: 'facility',
    title: 'Research Facility',
    subtitle: 'Sublevel 2 — industrial corridors, hazard striping, overhead bays',
    prompt: 'First-person industrial research facility',
    atmosphere: 'Cold fluorescent light, concrete floors, sealed lab doors',
    available: true,
  },
  {
    id: 'warehouse',
    title: 'Logistics Warehouse',
    subtitle: 'High racks, loading docks, autonomous forklift lanes',
    prompt: 'First-person logistics warehouse with tall aisles',
    atmosphere: 'Coming online for the next engine drop',
    available: false,
  },
  {
    id: 'lab_corridor',
    title: 'Clean Lab Corridor',
    subtitle: 'Positive-pressure halls and observation windows',
    prompt: 'First-person sterile laboratory corridor',
    atmosphere: 'Coming online for the next engine drop',
    available: false,
  },
]
