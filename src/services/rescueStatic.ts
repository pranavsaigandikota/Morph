import type {
  RescueManifest,
  RescueStaticBundle,
  RescueAgentInfo,
  StaticTrajectory,
  StaticEvaluation,
  StaticTrainingHistory,
} from '../types/rescueStatic'
import type { BuildingMap } from '../types/simulation'

const BASE = '/data/rescue'

async function fetchJson<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Load the full static rescue package driven by manifest.json. */
export async function loadRescuePackage(): Promise<RescueStaticBundle> {
  const manifest = await fetchJson<RescueManifest>('manifest.json')

  const maps: Record<string, BuildingMap> = {}
  const agents: Record<string, RescueAgentInfo> = {}
  const trajectories: Record<string, StaticTrajectory> = {}
  const evaluations: Record<string, StaticEvaluation> = {}
  const training: Record<string, StaticTrainingHistory> = {}

  await Promise.all([
    ...manifest.maps.map(async (m) => {
      maps[m.id] = await fetchJson<BuildingMap>(m.path)
    }),
    ...manifest.agents.map(async (a) => {
      agents[a.id] = await fetchJson<RescueAgentInfo>(a.path)
    }),
    ...manifest.trajectories.map(async (t) => {
      trajectories[t.id] = await fetchJson<StaticTrajectory>(t.path)
    }),
    ...manifest.evaluations.map(async (e) => {
      evaluations[e.id] = await fetchJson<StaticEvaluation>(e.path)
    }),
    ...manifest.training_history.map(async (h) => {
      training[h.id] = await fetchJson<StaticTrainingHistory>(h.path)
    }),
  ])

  return { manifest, maps, agents, trajectories, evaluations, training }
}

export function trajectoriesForAgent(
  bundle: RescueStaticBundle,
  agentId: string,
): StaticTrajectory[] {
  return Object.values(bundle.trajectories).filter((t) => t.agent_id === agentId)
}
