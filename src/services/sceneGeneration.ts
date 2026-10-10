/**
 * Text → seed-image adapter.
 *
 * Waypoint does NOT process the prompt. A text-to-image model (or mock) produces the
 * initial seed; Waypoint then makes that seed interactive over /stream?seed=.
 *
 * Set VITE_SCENE_API_BASE_URL when Codex exposes a real scene API.
 * Until then we use an explicit MOCK generator — never claim AI generation.
 */

export interface GeneratedScene {
  id: string
  prompt: string
  /** Object URL or data URL of the seed preview */
  imageUrl: string
  /** Seed token to pass to WS /stream?seed= (name or uploaded id) */
  seed: string | null
  mock: boolean
  createdAt: string
}

export interface SceneProgress {
  stage: 'idle' | 'submitting' | 'generating' | 'ready' | 'error'
  percent: number
  message: string
}

const PRESETS = [
  'An abandoned futuristic city at sunset',
  'An underwater research station',
  'A mysterious alien planet',
  'A medieval castle courtyard',
  'A post-apocalyptic research facility',
]

const STORAGE_KEY = 'worldshift.savedScenes.v1'

export function scenePresets(): string[] {
  return [...PRESETS]
}

export function loadSavedScenes(): GeneratedScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as GeneratedScene[]
  } catch {
    return []
  }
}

export function persistSavedScenes(scenes: GeneratedScene[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes.slice(0, 24)))
}

function hashPrompt(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic MOCK seed image (canvas) — labeled, not AI-generated. */
export async function generateMockSeedImage(prompt: string): Promise<{ dataUrl: string; seed: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')!
  const h = hashPrompt(prompt)
  const hue = h % 360
  const g = ctx.createLinearGradient(0, 0, 1280, 720)
  g.addColorStop(0, `hsl(${hue} 35% 12%)`)
  g.addColorStop(0.5, `hsl(${(hue + 40) % 360} 30% 18%)`)
  g.addColorStop(1, `hsl(${(hue + 80) % 360} 25% 8%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1280, 720)

  // Atmospheric bands
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `hsla(${(hue + i * 12) % 360} 40% 40% / ${0.04 + (i % 3) * 0.02})`
    ctx.fillRect(0, 40 + i * 55, 1280, 30)
  }

  ctx.fillStyle = 'rgba(249,115,22,0.9)'
  ctx.font = 'bold 28px Syne, sans-serif'
  ctx.fillText('MOCK SEED — not AI-generated', 48, 64)

  ctx.fillStyle = 'rgba(232,238,245,0.92)'
  ctx.font = '600 36px Syne, sans-serif'
  const lines = wrapText(ctx, prompt, 1100)
  lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, 48, 160 + i * 48))

  ctx.fillStyle = 'rgba(154,171,190,0.8)'
  ctx.font = '16px DM Sans, sans-serif'
  ctx.fillText('Text→image mock adapter · Waypoint will animate a real seed when available', 48, 680)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const seed = `mock_${(h % 1e8).toString(36)}`
  return { dataUrl, seed }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else cur = test
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * Attempt real scene API if VITE_SCENE_API_BASE_URL is set; otherwise MOCK.
 * Never labels a mock result as AI-generated.
 */
export async function generateScene(
  prompt: string,
  onProgress?: (p: SceneProgress) => void,
): Promise<GeneratedScene> {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('Enter a world description')

  const api = import.meta.env.VITE_SCENE_API_BASE_URL as string | undefined
  onProgress?.({ stage: 'submitting', percent: 10, message: 'Submitting prompt…' })

  if (api) {
    try {
      onProgress?.({ stage: 'generating', percent: 40, message: 'Requesting text→image seed…' })
      const res = await fetch(`${api.replace(/\/$/, '')}/scenes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      })
      if (!res.ok) throw new Error(`Scene API ${res.status}`)
      const body = (await res.json()) as {
        id?: string
        seed?: string
        image_url?: string
        mock?: boolean
      }
      if (body.mock) {
        // Backend explicitly returned mock — honor that
      }
      if (!body.image_url && !body.seed) throw new Error('Scene API missing image_url/seed')
      onProgress?.({ stage: 'ready', percent: 100, message: 'Seed ready' })
      return {
        id: body.id ?? `scene_${Date.now().toString(36)}`,
        prompt: trimmed,
        imageUrl: body.image_url ?? '',
        seed: body.seed ?? null,
        mock: !!body.mock,
        createdAt: new Date().toISOString(),
      }
    } catch (err) {
      onProgress?.({
        stage: 'generating',
        percent: 55,
        message: `Scene API unavailable (${err instanceof Error ? err.message : 'error'}) — using MOCK seed`,
      })
    }
  }

  // Explicit mock path
  await new Promise((r) => setTimeout(r, 600))
  onProgress?.({ stage: 'generating', percent: 70, message: 'Rendering MOCK seed preview…' })
  await new Promise((r) => setTimeout(r, 400))
  const { dataUrl, seed } = await generateMockSeedImage(trimmed)
  onProgress?.({ stage: 'ready', percent: 100, message: 'MOCK seed ready (not AI-generated)' })
  return {
    id: `mock_${Date.now().toString(36)}`,
    prompt: trimmed,
    imageUrl: dataUrl,
    seed,
    mock: true,
    createdAt: new Date().toISOString(),
  }
}
