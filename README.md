# WorldShift AI

First-person **Waypoint** interactive worlds (Codex GPU) + offline **Rescue Lab** evaluation.

## Two modes

1. **World Explorer** — real-time Waypoint-generated video (`WS /stream`, binary JPEG envelopes). Needs Codex on `http://127.0.0.1:8000`.
2. **Rescue Lab** — recorded Random / A* / PPO replays & charts from `public/data/rescue/` via `fetch()`. No Python/FastAPI/PPO service.

## Quick start

**Windows:** see [docs/WINDOWS_VERIFY.md](docs/WINDOWS_VERIFY.md) for clone + GPU acceptance tests.

```bash
npm install
cp .env.example .env   # VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
npm run dev
```

- UI: http://127.0.0.1:4821  
- World: http://127.0.0.1:4821/world  
- Rescue: http://127.0.0.1:4821/simulation  

If `:8000` is down, the UI shows a **connection error**. It does **not** silently start mock. Explicit mock:

```bash
npm run dev:mock
npm run test:mock-protocol
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite → real `:8000` (no auto-mock) |
| `npm run dev:mock` | Explicit protocol mock on `:4822` |
| `npm run build` | Production build |
| `npm run test:mock-protocol` | Automated Phase-2 mock checks |
| `npm run test:stream60` | 60s control harness (`ENGINE_URL`) |

## Protocol

[docs/WAYPOINT_PROTOCOL.md](docs/WAYPOINT_PROTOCOL.md). Place Codex’s `FRONTEND_INTEGRATION.md` under `docs/` when available and reconcile before claiming GPU pass.

## Status

[docs/VALIDATION_STATUS.md](docs/VALIDATION_STATUS.md) — mock vs real tracks kept separate.
