# WorldShift AI

Interactive AI-generated worlds and autonomous rescue training — frontend for the WorldShift hackathon.

Inspired by Odyssey-style streamed worlds, with a separate deterministic Three.js rescue simulator and an agent evaluation dashboard.

## Features

- **Landing + scene selection** — Research Facility scene ready; more scenes locked as placeholders
- **AI World Explorer** — Codex Waypoint GPU stream (`WS /stream`), WASD + pointer-lock, clear connection status when the model server is down
- **Rescue Simulation Lab** — **static JSON** under `public/data/rescue/` (manifest-driven). Maps, recorded trajectories, eval charts, training history — no Python/FastAPI/PPO required
- **Agent Evaluation** — recorded metrics from the same static package; optional live API adapter
- **Windows launchers** — `start-windows.bat` / `start-windows.ps1` (see `docs/WINDOWS.md`)

World Explorer needs genuine Waypoint generation on `:8000`. Rescue Lab works from the static package alone.

## Quick start

**Windows:** double-click `start-windows.bat` (or `.\start-windows.ps1`). Details: [docs/WINDOWS.md](docs/WINDOWS.md).

```bash
npm install
npm run dev
```

- App: [http://127.0.0.1:4821](http://127.0.0.1:4821)
- **Rescue Lab data:** `public/data/rescue/manifest.json` (copy handoff here)
- **Waypoint engine (Codex):** `http://127.0.0.1:8000` — required for genuine World Explorer video

```bash
ENGINE_URL=http://127.0.0.1:8000 npm run test:stream60
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Mock server + Vite |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | TypeScript project build |
| `npm run lint` | Oxlint |
| `npm run preview` | Preview production build |

## Architecture

```
src/
  pages/           Landing, World Explorer, Rescue Lab, Agent Eval
  components/      World viewer, R3F scene, charts
  services/        Typed HTTP adapters + FrameTransport (WS framing)
  hooks/           useWorldStream, keyboard controls
  types/           Shared contracts
server/            Express + WebSocket mock implementing the contracts
docs/INTEGRATION.md
```

Routes:

- `/` — WorldShift landing
- `/world` — AI World Explorer
- `/simulation` — Rescue Simulation Lab
- `/agents` — Agent training / evaluation dashboard

## Integration

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for world/sim/agent contracts, proxy env vars, and transport notes.

## Design notes

- World Explorer uses the **Codex Waypoint Phase-2** protocol (`docs/WAYPOINT_PROTOCOL.md`) — binary JPEG envelopes, not prerecorded playback.
- Do **not** infer reliable physical geometry from generated video — use the simulator map.
- Do **not** implement Waypoint inference or RL training in this frontend.
- Generated FPS counts wire JPEGs; presentation drops never reduce that counter.
