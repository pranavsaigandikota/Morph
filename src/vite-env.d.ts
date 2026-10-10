/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLD_API_BASE_URL?: string
  readonly VITE_ENGINE_HTTP?: string
  readonly VITE_ENGINE_WS?: string
  readonly VITE_ENGINE_ORIGIN?: string
  readonly VITE_LIVE_SIM_URL?: string
  readonly VITE_SCENE_API_BASE_URL?: string
  readonly VITE_API_BASE?: string
  readonly VITE_WS_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
