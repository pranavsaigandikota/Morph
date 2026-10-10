/**
 * Text → seed-image adapter (Codex SDXL / scene API).
 *
 * Waypoint does NOT process the prompt. SDXL (or mock) produces the seed;
 * Waypoint makes it interactive over /stream?seed=.
 *
 * Prefer VITE_SCENE_API_BASE_URL; in Vite dev, default to /engine (proxied :8000).
 * Failed live generation surfaces an error — MOCK only via explicit request.
 */

import { engineHttpBase, worldApiBaseUrl } from './engineConfig'

export type WorldStyle = 'cinematic' | 'photorealistic' | 'fantasy' | 'stylized'

export interface GeneratedScene {
  id: string
  prompt: string
  style: WorldStyle
  /** Object URL or data URL of the seed preview */
  imageUrl: string
  /** Seed token to pass to WS /stream?seed= */
  seed: string | null
  mock: boolean
  createdAt: string
  source?: string
}

export interface SceneProgress {
  stage: 'idle' | 'submitting' | 'generating' | 'ready' | 'error'
  percent: number
  message: string
}

export const WORLD_STYLES: Array<{ id: WorldStyle; label: string; hint: string }> = [
  { id: 'cinematic', label: 'Cinematic', hint: 'Dramatic light, film still' },
  { id: 'photorealistic', label: 'Photorealistic', hint: 'Believable camera world' },
  { id: 'fantasy', label: 'Fantasy', hint: 'Mythic color & atmosphere' },
  { id: 'stylized', label: 'Stylized', hint: 'Bold graphic look' },
]

const PRESETS: Array<{ title: string; prompt: string; style: WorldStyle }> = [
  {
    title: 'Neon alley',
    prompt: 'A rain-soaked neon alley in a vertical megacity at night, reflective puddles, steam vents',
    style: 'cinematic',
  },
  {
    title: 'Coral observatory',
    prompt: 'An underwater glass observatory surrounded by bioluminescent coral reefs',
    style: 'fantasy',
  },
  {
    title: 'Cliff monastery',
    prompt: 'A cliffside monastery above endless clouds at golden hour, stone courtyards',
    style: 'photorealistic',
  },
  {
    title: 'Desert bazaar',
    prompt: 'A bustling desert bazaar at dusk with lanterns, spice stalls, and distant dunes',
    style: 'stylized',
  },
  {
    title: 'Orbital garden',
    prompt: 'A zero-gravity botanical garden inside a transparent orbital habitat',
    style: 'cinematic',
  },
  {
    title: 'Frozen cathedral',
    prompt: 'An ice cathedral carved into a glacier, pale blue shafts of light',
    style: 'fantasy',
  },
]

const RANDOM_IDEAS = [
  'A library where books float between towering shelves of living wood',
  'A rooftop jazz garden above a glowing metropolis',
  'An abandoned theme park reclaimed by fluorescent moss',
  'A train station suspended between two floating islands',
  'A candlelit labyrinth of mirrors under a purple sky',
  'A coastal lighthouse town during a green aurora',
  'A workshop filled with clockwork animals and brass skylights',
  'A bamboo forest shrine with floating lanterns at midnight',
]

const STORAGE_KEY = 'worldshift.savedScenes.v2'

export function scenePresets() {
  return PRESETS.map((p) => ({ ...p }))
}

export function randomWorldIdea(): string {
  return RANDOM_IDEAS[Math.floor(Math.random() * RANDOM_IDEAS.length)]!
}

export function loadSavedScenes(): GeneratedScene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('worldshift.savedScenes.v1')
    if (!raw) return []
    return (JSON.parse(raw) as GeneratedScene[]).map((s) => ({
      ...s,
      style: s.style ?? 'cinematic',
    }))
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

function sceneApiBase(): string {
  if (import.meta.env.VITE_SCENE_API_BASE_URL) {
    return String(import.meta.env.VITE_SCENE_API_BASE_URL).replace(/\/$/, '')
  }
  // Same host as Waypoint in local Windows demos (proxied in Vite).
  if (import.meta.env.DEV) return engineHttpBase()
  return worldApiBaseUrl()
}

/** Deterministic MOCK seed — labeled, never claimed as AI. */
export async function generateMockSeedImage(
  prompt: string,
  style: WorldStyle,
): Promise<{ dataUrl: string; seed: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')!
  const h = hashPrompt(`${style}:${prompt}`)
  const hue = h % 360
  const g = ctx.createLinearGradient(0, 0, 1280, 720)
  g.addColorStop(0, `hsl(${hue} 38% 10%)`)
  g.addColorStop(0.55, `hsl(${(hue + 48) % 360} 32% 16%)`)
  g.addColorStop(1, `hsl(${(hue + 96) % 360} 28% 7%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1280, 720)

  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `hsla(${(hue + i * 14) % 360} 45% 45% / ${0.035 + (i % 3) * 0.02})`
    ctx.fillRect(0, 28 + i * 48, 1280, 26)
  }

  ctx.fillStyle = 'rgba(249,115,22,0.92)'
  ctx.font = 'bold 26px Syne, sans-serif'
  ctx.fillText('MOCK SEED — not AI-generated', 48, 58)

  ctx.fillStyle = 'rgba(46,230,214,0.85)'
  ctx.font = '600 18px DM Sans, sans-serif'
  ctx.fillText(`Style · ${style}`, 48, 96)

  ctx.fillStyle = 'rgba(238,243,248,0.94)'
  ctx.font = '600 34px Syne, sans-serif'
  wrapText(ctx, prompt, 1120)
    .slice(0, 4)
    .forEach((line, i) => ctx.fillText(line, 48, 170 + i * 46))

  ctx.fillStyle = 'rgba(154,171,190,0.75)'
  ctx.font = '15px DM Sans, sans-serif'
  ctx.fillText('Explicit mock preview · start Codex SDXL for live seeds', 48, 680)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    seed: `mock_${(h % 1e8).toString(36)}`,
  }
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

interface SceneApiBody {
  id?: string
  seed?: string
  image_url?: string
  imageUrl?: string
  data_url?: string
  mock?: boolean
  style?: string
  source?: string
}

async function postSceneGenerate(
  base: string,
  prompt: string,
  style: WorldStyle,
): Promise<SceneApiBody> {
  const paths = ['/scenes/generate', '/sdxl/generate', '/generate']
  let lastErr: Error | null = null
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, width: 1280, height: 720 }),
      })
      if (!res.ok) {
        lastErr = new Error(`Scene API ${res.status} at ${path}`)
        continue
      }
      return (await res.json()) as SceneApiBody
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr ?? new Error('Scene API unreachable')
}

export type GenerateMode = 'live' | 'mock'

/**
 * Live SDXL/scene generation. Pass mode:'mock' only for an explicit mock preview.
 */
export async function generateScene(
  prompt: string,
  options: {
    style?: WorldStyle
    mode?: GenerateMode
    onProgress?: (p: SceneProgress) => void
  } = {},
): Promise<GeneratedScene> {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('Describe a world you want to explore')
  const style = options.style ?? 'cinematic'
  const onProgress = options.onProgress

  if (options.mode === 'mock') {
    onProgress?.({ stage: 'generating', percent: 40, message: 'Rendering explicit MOCK preview…' })
    await new Promise((r) => setTimeout(r, 350))
    const { dataUrl, seed } = await generateMockSeedImage(trimmed, style)
    onProgress?.({ stage: 'ready', percent: 100, message: 'MOCK seed ready (not AI-generated)' })
    return {
      id: `mock_${Date.now().toString(36)}`,
      prompt: trimmed,
      style,
      imageUrl: dataUrl,
      seed,
      mock: true,
      createdAt: new Date().toISOString(),
      source: 'mock',
    }
  }

  const base = sceneApiBase()
  onProgress?.({ stage: 'submitting', percent: 12, message: `Contacting SDXL at ${base}…` })
  onProgress?.({ stage: 'generating', percent: 45, message: `Generating ${style} seed…` })

  const body = await postSceneGenerate(base, trimmed, style)
  const imageUrl = body.image_url || body.imageUrl || body.data_url || ''
  if (!imageUrl && !body.seed) throw new Error('Scene API returned neither image nor seed')

  onProgress?.({ stage: 'ready', percent: 100, message: 'Seed ready' })
  return {
    id: body.id ?? `scene_${Date.now().toString(36)}`,
    prompt: trimmed,
    style,
    imageUrl,
    seed: body.seed ?? null,
    mock: !!body.mock,
    createdAt: new Date().toISOString(),
    source: body.source ?? 'sdxl',
  }
}
