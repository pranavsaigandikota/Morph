# WorldShift AI

First-person **Waypoint** interactive worlds (Codex GPU) + offline **Rescue Lab** evaluation.

## Two modes

1. **World Explorer** — real-time Waypoint-generated video (`WS /stream`, binary JPEG envelopes). Needs Codex on `http://127.0.0.1:8000`.
2. **Rescue Lab** — recorded Random / A* / PPO replays & charts from `public/data/rescue/` via `fetch()`. No Python/FastAPI/PPO service.

## Quick start

**Windows:** double-click `start-windows.bat` — see [docs/WINDOWS.md](docs/WINDOWS.md).

```bash
npm install
npm run dev
```

- UI: http://127.0.0.1:4821  
- Config: copy `.env.example` → `.env` (`VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000`)

If `:8000` is down, `npm run dev` starts a **protocol mock** and shows an explicit **MOCK** badge. Cloud VMs cannot reach your PC’s GPU — validate WASD/mouse on Windows against real Waypoint before calling World Explorer “done” ([docs/WINDOWS_GPU_CHECKLIST.md](docs/WINDOWS_GPU_CHECKLIST.md)).

```bash
npm run dev:mock              # force mock
npm run test:mock-protocol    # automated Phase-2 mock checks
npm run test:stream60         # 60s control harness (set ENGINE_URL)
```

## Create World

`/create` — describe a world → seed preview → Start Exploring.  
Text→image produces the seed; **Waypoint does not process the prompt**. Without `VITE_SCENE_API_BASE_URL`, seeds are clearly labeled **MOCK**.

## Protocol

See [docs/WAYPOINT_PROTOCOL.md](docs/WAYPOINT_PROTOCOL.md). If Codex provides `FRONTEND_INTEGRATION.md`, place it under `docs/` and reconcile any disagreements before changing the client.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite (+ mock if :8000 down) |
| `npm run build` | Production build |
| `npm run test:stream60` | Navigation session metrics |
