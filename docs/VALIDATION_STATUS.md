# World Explorer — mock vs Windows GPU status

Integration requirements (1–7) are implemented in code. **Completion** still requires your Windows GPU checklist.

## Requirement coverage

| # | Requirement | Code status |
|---|-------------|-------------|
| 1 | Phase-2 `/stream` + binary JPEG envelopes + control + frame meta | Done (`waypointEnvelope.ts`, `useWorldStream.ts`) |
| 2 | Mock vs real separated; explicit MOCK indicator | Done (hello.`mock` / engine name → badge + banner) |
| 3 | `VITE_WORLD_API_BASE_URL` default `http://127.0.0.1:8000` | Done (`.env.example`, `engineConfig.ts`) |
| 4 | Cloud can’t reach your GPU; mock tests + Windows instructions | Done (`test:mock-protocol`, `docs/WINDOWS_GPU_CHECKLIST.md`) |
| 5 | Not complete until Windows WASD/mouse verified | **Held open** — see below |
| 6 | `npm install` && `npm run dev` independently runnable | Done |
| 7 | No backend rebuild; Rescue Lab schema frozen (additive only) | Done |

## Mock mode — PASSED (this environment)

Run: `npm run mock` then `ENGINE_URL=http://127.0.0.1:4822 npm run test:mock-protocol`

| Test | Result |
|------|--------|
| `GET /healthz` (or readyz) | Pass |
| `WS /stream` hello (`session_id`, `width`, `height`, `temporal_compression`) | Pass |
| Binary LE JPEG batch envelopes | Pass |
| Control JSON `{type,buttons,dx,dy,scroll,ts}` accepted | Pass |
| Valid JPEG SOI on all sub-frames | Pass |
| `frame_id` non-decreasing | Pass |
| Generated FPS from wire JPEGs (~70 on mock) | Pass |
| Explicit `mock: true` / MOCK UI path | Pass |
| Bounded presentation queue (stale drop) | Pass (client) |
| Rescue Lab `public/data/rescue/manifest.json` via fetch | Pass |
| `npm run build` / `tsc` | Pass |

## Real Codex Waypoint on your Windows PC — STILL REQUIRED

| Test | Status |
|------|--------|
| Connect with `VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000` | Pending on your PC |
| No MOCK badge | Pending |
| WASD changes generated pixels | Pending |
| Pointer-lock mouse changes pixels | Pending |
| Gen FPS ~71.7 / Disp FPS ~20 | Pending |
| Pause / reset / reconnect on real stream | Pending |

Follow **[WINDOWS_GPU_CHECKLIST.md](./WINDOWS_GPU_CHECKLIST.md)** exactly.

Until that checklist passes, **do not treat World Explorer as integration-complete**.
