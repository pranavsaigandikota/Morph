import { engineHttpBase } from './engineConfig'

/** Backend capability flags from GET /health (World Memory API v1.2). Absent ⇒ feature unavailable. */
export interface WorldCapabilities {
  memory_api: boolean
  checkpoint_restore: boolean
  light_navigation: boolean
  idle_hold: boolean
  sprint_key: boolean
  enhancement: boolean
  anchors: boolean
  contract: string | null
  model: string | null
}

let cached: Promise<WorldCapabilities | null> | null = null

export function getWorldCapabilities(force = false): Promise<WorldCapabilities | null> {
  if (!cached || force) {
    cached = fetch(`${engineHttpBase()}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        if (!h || !h.capabilities) return null
        const c = h.capabilities
        return {
          memory_api: !!c.memory_api,
          checkpoint_restore: !!c.checkpoint_restore,
          light_navigation: !!c.light_navigation,
          idle_hold: !!c.idle_hold,
          sprint_key: !!c.sprint_key,
          enhancement: !!c.enhancement,
          anchors: !!c.anchors,
          contract: h.contract ?? null,
          model: h.model ?? null,
        }
      })
      .catch(() => null)
  }
  return cached
}
