import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

/**
 * Proxies /engine → Codex Waypoint (VITE_WORLD_API_BASE_URL / ENGINE_TARGET).
 * Default http://127.0.0.1:8000. For cloud mock testing set ENGINE_TARGET=http://127.0.0.1:4822.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const engineTarget =
    env.ENGINE_TARGET ||
    env.VITE_WORLD_API_BASE_URL ||
    process.env.ENGINE_TARGET ||
    process.env.VITE_WORLD_API_BASE_URL ||
    'http://127.0.0.1:8000'
  const mockTarget = 'http://127.0.0.1:4822'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 4821,
      host: '0.0.0.0',
      proxy: {
        '/engine': {
          target: engineTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/engine/, ''),
          ws: true,
          rewriteWsOrigin: false,
          headers: { Origin: "http://127.0.0.1:3000" },
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.warn(`[vite] /engine → ${engineTarget} error:`, err.message)
              if (res && 'writeHead' in res && typeof res.writeHead === 'function'
                && !res.headersSent && !res.writableEnded && !res.destroyed) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    error: 'engine_unreachable',
                    target: engineTarget,
                    hint: 'Start Codex Waypoint on :8000, or ENGINE_TARGET=http://127.0.0.1:4822 for protocol mock',
                  }),
                )
              }
            })
          },
        },
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
