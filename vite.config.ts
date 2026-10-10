import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

/**
 * ENGINE_TARGET — Codex Waypoint inference (default :8000).
 * When unreachable at boot, scripts/dev.mjs can point this at the protocol mock (:4822).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const engineTarget = env.ENGINE_TARGET || process.env.ENGINE_TARGET || 'http://127.0.0.1:8000'
  const mockTarget = 'http://127.0.0.1:4822'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 4821,
      host: '0.0.0.0',
      proxy: {
        // Real Waypoint engine (Codex) — HTTP + WS under /engine
        '/engine': {
          target: engineTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/engine/, ''),
          ws: true,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.warn(`[vite] engine proxy error → ${engineTarget}:`, err.message)
              if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    error: 'engine_unreachable',
                    target: engineTarget,
                    hint: 'Start Codex Waypoint on :8000, or ENGINE_TARGET=http://127.0.0.1:4822',
                  }),
                )
              }
            })
          },
        },
        // Simulation + agents mock API (unchanged)
        '/api': {
          target: mockTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/ws': {
          target: mockTarget.replace('http', 'ws'),
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ''),
        },
      },
    },
  }
})
