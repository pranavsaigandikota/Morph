/**
 * High-quality SDXL starter candidates — human approval before Waypoint.
 *
 * Verified SCENE_API.md documents Turbo steps 1–4 @ ~640×384 only.
 * Experimental HQ (1280×720, ~30 steps) is requested when the backend accepts
 * quality:"high". We never silently fall back to Turbo while labeling HQ.
 */

import { engineHttpBase, worldApiBaseUrl } from './engineConfig'
import type { GeneratedScene, SceneProgress, WorldStyle } from './sceneGeneration'

export const HQ_TARGET = {
  width: 1280,
  height: 720,
  steps: 30,
  quality: 'high' as const,
  perspective: 'first_person' as const,
}

/** Default deterministic seeds for a contact sheet (override per run). */
export const DEFAULT_HQ_SEEDS = [
  202610101, 202610102, 202610103, 202610104, 202610105, 202610106,
] as const

export type StarterApproval = 'pending' | 'approved' | 'rejected'

export interface HqStarterCandidate {
  id: string
  prompt: string
  /** Prompt actually sent (may include first-person composition guidance). */
  effectivePrompt: string
  style: WorldStyle
  generationSeed: number
  steps: number
  width: number
  height: number
  quality: 'high' | 'turbo' | 'unknown'
  model?: string | null
  revision?: string | null
  imageUrl: string
  imageSha256: string | null
  sceneId: string | null
  mock: boolean
  createdAt: string
  approval: StarterApproval
  /** Unsuitable notes (e.g. rejected Waypoint frame). */
  unsuitableReason?: string | null
}

export interface HqBatchResult {
  candidates: HqStarterCandidate[]
  errors: Array<{ seed: number; message: string }>
  hqApiAvailable: boolean
  message: string
}

function sceneApiBase(): string {
  if (import.meta.env.VITE_SCENE_API_BASE_URL) {
    return String(import.meta.env.VITE_SCENE_API_BASE_URL).replace(/\/$/, '')
  }
  if (import.meta.env.DEV) return engineHttpBase()
  return worldApiBaseUrl()
}

async function sceneRequest(path: string, init?: RequestInit) {
  const res = await fetch(sceneApiBase() + path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Scene API ${res.status}: ${JSON.stringify((body as { detail?: unknown }).detail ?? body)}`)
  }
  return body as Record<string, unknown>
}

/**
 * Strengthen first-person exploration composition without changing the user's theme.
 */
export function composeFirstPersonExplorePrompt(userPrompt: string): string {
  const base = userPrompt.trim()
  const guide =
    'first-person eye-level view, clear forward depth, recognizable buildings or natural structures, ' +
    'sensible architecture, open path ahead when appropriate, coherent lighting, detailed materials, ' +
    'no abstract blobs, no distorted geometry'
  if (/first[- ]person/i.test(base)) return `${base}, ${guide}`.slice(0, 500)
  return `${base}. ${guide}`.slice(0, 500)
}

function fromJobMetadata(
  meta: Record<string, unknown>,
  effectivePrompt: string,
  style: WorldStyle,
  requestedSteps: number,
): HqStarterCandidate {
  const imageUrl = String(meta.image_url ?? '')
  const abs = imageUrl.startsWith('http') ? imageUrl : sceneApiBase() + imageUrl
  const dims = (meta.output_dimensions ?? meta.model_dimensions ?? {}) as {
    width?: number
    height?: number
  }
  const steps = Number(meta.steps ?? requestedSteps)
  const quality: HqStarterCandidate['quality'] =
    steps >= 20 && (dims.width ?? 0) >= 1024 ? 'high' : steps <= 4 ? 'turbo' : 'unknown'
  return {
    id: String(meta.scene_id ?? `cand_${Date.now()}`),
    prompt: String(meta.prompt ?? effectivePrompt),
    effectivePrompt,
    style,
    generationSeed: Number(meta.seed ?? 0),
    steps,
    width: Number(dims.width ?? HQ_TARGET.width),
    height: Number(dims.height ?? HQ_TARGET.height),
    quality,
    model: meta.model != null ? String(meta.model) : null,
    revision: meta.revision != null ? String(meta.revision) : null,
    imageUrl: abs,
    imageSha256: meta.image_sha256 != null ? String(meta.image_sha256) : null,
    sceneId: meta.scene_id != null ? String(meta.scene_id) : null,
    mock: false,
    createdAt: String(meta.created_at ?? new Date().toISOString()),
    approval: 'pending',
  }
}

/**
 * Attempt one HQ generate. Throws if API rejects HQ parameters (no silent Turbo relabel).
 */
export async function generateHqCandidate(
  userPrompt: string,
  options: {
    style: WorldStyle
    seed: number
    onProgress?: (p: SceneProgress) => void
  },
): Promise<HqStarterCandidate> {
  const effectivePrompt = composeFirstPersonExplorePrompt(userPrompt)
  options.onProgress?.({
    stage: 'submitting',
    percent: 5,
    message: `HQ seed ${options.seed} → experimental SDXL…`,
  })

  const bodyHq = {
    prompt: effectivePrompt,
    style: options.style,
    seed: options.seed,
    steps: HQ_TARGET.steps,
    perspective: HQ_TARGET.perspective,
    quality: HQ_TARGET.quality,
    width: HQ_TARGET.width,
    height: HQ_TARGET.height,
  }

  let submitted: Record<string, unknown>
  try {
    submitted = await sceneRequest('/scenes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyHq),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `HQ generate rejected for seed ${options.seed}. Experimental 1280×720/~30-step API required. ` +
        `Verified Turbo (steps≤4) will not be silently used as HQ. Detail: ${msg}`,
    )
  }

  const pollUrl = String(submitted.poll_url)
  for (;;) {
    const job = await sceneRequest(pollUrl)
    const status = String(job.status)
    if (status === 'error') throw new Error(String(job.error || 'HQ SDXL failed'))
    if (status === 'ready') {
      const meta = job.metadata as Record<string, unknown>
      const cand = fromJobMetadata(meta, effectivePrompt, options.style, HQ_TARGET.steps)
      if (cand.quality === 'turbo') {
        throw new Error(
          `Seed ${options.seed} returned Turbo-class settings (steps=${cand.steps}). ` +
            `Not accepting as HQ starter.`,
        )
      }
      options.onProgress?.({
        stage: 'ready',
        percent: 100,
        message: `HQ candidate ready · seed ${options.seed}`,
      })
      return cand
    }
    const step = Number(job.step ?? 0)
    const total = Number(job.total_steps ?? HQ_TARGET.steps)
    options.onProgress?.({
      stage: 'generating',
      percent: 10 + (80 * step) / Math.max(1, total),
      message: `${String(job.phase ?? 'denoising').replaceAll('_', ' ')} · seed ${options.seed} · ${step}/${total}`,
    })
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** Generate a contact-sheet batch; continues after per-seed failures. */
export async function generateHqContactSheet(
  userPrompt: string,
  options: {
    style: WorldStyle
    seeds?: number[]
    onProgress?: (p: SceneProgress) => void
  },
): Promise<HqBatchResult> {
  const seeds = options.seeds ?? [...DEFAULT_HQ_SEEDS]
  const candidates: HqStarterCandidate[] = []
  const errors: HqBatchResult['errors'] = []
  let hqApiAvailable = true

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!
    options.onProgress?.({
      stage: 'generating',
      percent: Math.round((i / seeds.length) * 100),
      message: `Candidate ${i + 1}/${seeds.length} · seed ${seed}`,
    })
    try {
      const c = await generateHqCandidate(userPrompt, {
        style: options.style,
        seed,
        onProgress: options.onProgress,
      })
      candidates.push(c)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ seed, message })
      if (/rejected|422|steps|quality|experimental/i.test(message)) hqApiAvailable = false
    }
  }

  return {
    candidates,
    errors,
    hqApiAvailable: hqApiAvailable && candidates.length > 0,
    message:
      candidates.length === 0
        ? 'No HQ candidates. Experimental SDXL HIGH API may be unavailable on this host (cloud has no :8000 GPU).'
        : `${candidates.length} HQ candidate(s) ready for human approval. Do not start Waypoint until one is approved.`,
  }
}

export function candidateToGeneratedScene(c: HqStarterCandidate): GeneratedScene {
  return {
    id: c.sceneId ?? c.id,
    prompt: c.prompt,
    style: c.style,
    imageUrl: c.imageUrl,
    seed: c.sceneId,
    mock: c.mock,
    createdAt: c.createdAt,
    source: 'sdxl-hq',
    generationSeed: c.generationSeed,
  }
}

/** Policy: degraded Waypoint frames are never recovery anchors. */
export const RECOVERY_POLICY = {
  allowDegradedWaypointAnchors: false,
  requireApprovedSdxlStarter: true,
  rejectReason:
    'Early / blurry Waypoint checkpoint rejected as recovery anchor. Use an approved HQ SDXL starter or verified scene-start/restore only.',
} as const

const APPROVED_KEY = 'ws_hq_approved_starters_v1'
const CANDIDATES_KEY = 'ws_hq_candidates_v1'

export function isRecoveryAnchorAllowed(cp: {
  recoverySuitable?: boolean
  restorable?: boolean
  kind?: string
}): boolean {
  if (cp.recoverySuitable === false) return false
  if (cp.kind === 'waypoint_frame' && !RECOVERY_POLICY.allowDegradedWaypointAnchors) {
    return false
  }
  return cp.restorable !== false
}

export function persistHqCandidates(candidates: HqStarterCandidate[]): void {
  try {
    localStorage.setItem(CANDIDATES_KEY, JSON.stringify(candidates))
  } catch {
    /* ignore quota */
  }
}

export function loadHqCandidates(): HqStarterCandidate[] {
  try {
    const raw = localStorage.getItem(CANDIDATES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HqStarterCandidate[]
  } catch {
    return []
  }
}

export function persistApprovedStarter(c: HqStarterCandidate): void {
  try {
    const prev = loadApprovedStarters().filter((x) => x.id !== c.id)
    localStorage.setItem(APPROVED_KEY, JSON.stringify([{ ...c, approval: 'approved' }, ...prev].slice(0, 12)))
  } catch {
    /* ignore */
  }
}

export function loadApprovedStarters(): HqStarterCandidate[] {
  try {
    const raw = localStorage.getItem(APPROVED_KEY)
    if (!raw) return []
    return JSON.parse(raw) as HqStarterCandidate[]
  } catch {
    return []
  }
}
