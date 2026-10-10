import type {
  AgentReplaySummary,
  EvaluationRequest,
  EvaluationResult,
} from '../src/types/agents.ts'

const evaluations = new Map<string, EvaluationResult>()
const replays = new Map<string, AgentReplaySummary>()

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function evaluateAgent(req: EvaluationRequest): EvaluationResult {
  const episodes = req.episodes ?? 12
  const seed =
    [...`${req.agent_id}:${req.scenario_id}`].reduce((a, c) => a + c.charCodeAt(0), 0) >>> 0
  const rnd = mulberry32(seed)
  const id = `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

  const episodeResults = Array.from({ length: episodes }, (_, i) => {
    const success = rnd() > 0.28
    const steps = Math.round(18 + rnd() * 40)
    const reward = success ? 40 + rnd() * 55 - steps * 0.2 : -10 + rnd() * 20
    return {
      episode: i + 1,
      reward: Math.round(reward * 10) / 10,
      steps,
      success,
      latency_ms: Math.round(12 + rnd() * 40),
      victims_rescued: success ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2),
    }
  })

  const successCount = episodeResults.filter((e) => e.success).length
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const training_curve = Array.from({ length: 40 }, (_, i) => {
    const progress = i / 39
    return {
      step: (i + 1) * 250,
      reward: Math.round((8 + progress * 62 + (rnd() - 0.5) * 8) * 10) / 10,
      success_rate: Math.round((0.2 + progress * 0.65 + (rnd() - 0.5) * 0.08) * 100) / 100,
    }
  })

  const result: EvaluationResult = {
    evaluation_id: id,
    agent_id: req.agent_id,
    scenario_id: req.scenario_id,
    created_at: new Date().toISOString(),
    episodes: episodeResults,
    metrics: {
      success_rate: Math.round((successCount / episodes) * 100) / 100,
      mean_reward: Math.round(mean(episodeResults.map((e) => e.reward)) * 10) / 10,
      mean_steps: Math.round(mean(episodeResults.map((e) => e.steps))),
      mean_latency_ms: Math.round(mean(episodeResults.map((e) => e.latency_ms))),
      mean_victims_rescued:
        Math.round(mean(episodeResults.map((e) => e.victims_rescued)) * 100) / 100,
    },
    training_curve,
  }

  evaluations.set(id, result)

  const replayId = `areplay_${Date.now().toString(36)}`
  replays.set(replayId, {
    id: replayId,
    agent_id: req.agent_id,
    scenario_id: req.scenario_id,
    success: result.metrics.success_rate >= 0.5,
    steps: result.metrics.mean_steps,
    reward: result.metrics.mean_reward,
    created_at: result.created_at,
  })

  return result
}

export function getAgentReplay(id: string): AgentReplaySummary | null {
  return replays.get(id) ?? null
}

export function listAgentReplays(): AgentReplaySummary[] {
  return [...replays.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}
