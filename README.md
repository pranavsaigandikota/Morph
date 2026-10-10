# WorldShift AI

Interactive AI-generated worlds and autonomous rescue training — frontend for the WorldShift hackathon.

Inspired by Odyssey-style streamed worlds, with a separate deterministic Three.js rescue simulator and an agent evaluation dashboard.

## Features

- **Landing + scene selection** — Research Facility scene ready; more scenes locked as placeholders
- **AI World Explorer** — WebSocket frame stream, WASD + pointer-lock look, pause / reset / disconnect
- **Performance overlay** — generated FPS, displayed FPS, latency, dropped frames, GPU memory, connection status
- **Rescue Simulation Lab** — React Three Fiber map with walls, hazards, exits, agent motion, replay scrubbing
- **Agent Evaluation** — mock evaluate API, Recharts training/episode charts, replay summaries
- **Local mock server** — implements world, simulation, and agent contracts for independent UI work

Mock streams are procedurally generated PNG frames (not prerecorded video) and always show a **MOCK** indicator.

## Quick start

```bash
npm install
npm run dev
```

- App: [http://127.0.0.1:4821](http://127.0.0.1:4821)
- Mock API: `http://127.0.0.1:4822`
- Health: `GET http://127.0.0.1:4822/health`

`npm run dev` starts the mock API and Vite together. Use `npm run mock` / `npm run dev:web` to run them separately.

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

- Do **not** infer reliable physical geometry from generated video — use the simulator map.
- Do **not** implement Waypoint inference or reinforcement learning in this repo.
- Frame delivery uses a one-frame display policy to avoid unbounded buffering.
