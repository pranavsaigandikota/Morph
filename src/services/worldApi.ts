import { engineHttpBase } from './engineConfig'
import type { EngineStatus } from '../types/world'

async function engineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${engineHttpBase()}${path}`, init)
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    throw new Error(`Engine ${res.status}: ${path}: ${JSON.stringify(body)}`)
  }
  return body as T
}

/**
 * Probe the real model_loaded/status schema from /health.
 */
export const worldApi = {
  async probe(): Promise<EngineStatus> {
    try {
      const h = await engineFetch<{status:string;model_loaded:boolean;model:string;error?:string}>('/health')
      const supported=h.model==='Overworld/Waypoint-1.5-1B'
      return {ok:h.model_loaded && h.status !== 'error' && supported, mock:false, engine:'Waypoint native 720p FP8',
        model:h.model, temporal_compression:4, message:supported?(h.error || h.status):'Native 1280×720 Waypoint required; unsupported model endpoint rejected.'}
    } catch(err) { return {ok:false,mock:false,message:String(err)} }
  },
  async start(prompt:string, seed?:string|null): Promise<{session_id:string}> {
    let request:unknown = {scene_id:'facility',seed_image_path:null,prompt}
    if (seed && seed !== 'facility' && seed !== 'facility_default') {
      const scene = await engineFetch<{world_start_request:unknown}>(`/scenes/${encodeURIComponent(seed)}`)
      request = scene.world_start_request
    }
    return engineFetch('/world/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})
  },
  async action(sessionId:string, action:'reset'|'stop'|'pause'|'resume') {
    return engineFetch(`/world/${action}`,{keepalive:true,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId})})
  },
  async listSeeds(): Promise<string[]> {
    try {
      const r = await engineFetch<{ scenes: {scene_id:string}[] }>('/scenes')
      return r.scenes.map(s=>s.scene_id)
    } catch {
      return []
    }
  },

  /** Optional GPU / metrics endpoint if Codex exposes it. */
  async metrics(_sessionId: string): Promise<{ gpu_memory_mb?: number; vram_mb?:number; generated_fps?: number } | null> {
    try {
      return await engineFetch('/world/metrics')
    } catch {
      return null
    }
  },
}
