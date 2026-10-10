import { engineHttpBase } from './engineConfig'

/**
 * One-step world creation: a single native 1280x720, 30-step SDXL image from the prompt, then explore.
 * No contact sheet or approval step. Returns the backend scene_id to start Waypoint from.
 */
export async function createHqWorld(
  prompt: string,
  opts: { style?: string | null; seed?: number | null; onProgress?: (percent: number, message: string) => void } = {},
): Promise<{ sceneId: string; prompt: string }> {
  const base = engineHttpBase()
  const body = {
    prompt: prompt.trim(),
    style: opts.style || null,
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    steps: 30,
    quality: 'high',
    perspective: 'first_person',
    width: 1280,
    height: 720,
  }
  opts.onProgress?.(3, 'Creating your world…')
  const res = await fetch(`${base}/scenes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const submitted = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = submitted?.detail
    const msg = typeof detail === 'string' ? detail : detail?.message ?? JSON.stringify(detail)
    if (res.status === 409) throw new Error('A world is still running in another tab. Close it, then try again.')
    if (res.status === 422) throw new Error(`Please rephrase the prompt: ${msg}`)
    throw new Error(`Could not start creation (${res.status}): ${msg}`)
  }
  for (;;) {
    await new Promise((r) => setTimeout(r, 700))
    const j = await fetch(`${base}${submitted.poll_url}`).then((r) => r.json())
    if (j.status === 'error') {
      const e = String(j.error || 'Image generation failed')
      throw new Error(/77-token/.test(e) ? 'That prompt is too long — please shorten it a little.' : e)
    }
    if (j.status === 'ready') {
      opts.onProgress?.(100, 'World ready — entering…')
      return { sceneId: String(j.scene_id), prompt: body.prompt }
    }
    const step = Number(j.step ?? 0)
    const total = Number(j.total_steps ?? 30)
    opts.onProgress?.(5 + Math.round((90 * step) / Math.max(1, total)), 'Painting the first view…')
  }
}
