# WorldShift AI

**Create. Explore. Survive. Adapt.**

First-person **Waypoint** worlds (Codex GPU) + interactive **Rescue Missions** + verified **AI Showdown**.

## Modes

| Route | Purpose |
|-------|---------|
| `/create` | Create Anything — HQ SDXL contact sheet (approve before Waypoint) + Turbo secondary |
| `/world` | World Explorer — Phase-2 `/stream` |
| `/mission` | Playable rescue on verified facility map |
| `/simulation` | Recorded Random / PPO / A* replays |
| `/agents` | AI Showdown verified rates |

## Quick start (Windows)

```powershell
git clone https://github.com/pranavsaigandikota/Morph.git
cd Morph
npm install
Copy-Item .env.example .env
# Start Codex Waypoint (+ SDXL) on :8000
npm run dev
```

UI: **http://127.0.0.1:4821**

- Real GPU: Codex on `:8000` — no silent mock fallback
- Explicit mock: `npm run dev:mock`
- Judging script: [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite → real `:8000` |
| `npm run dev:mock` | Explicit protocol mock |
| `npm run build` | Production build |
| `npm run test:mock-protocol` | Phase-2 mock checks |
| `npm run test:stream60` | 60s harness |

## Notes

- Rescue Missions & Showdown work from `public/data/rescue/` without a GPU.
- Guided PPO metrics assume shortest-path access — labeled on Showdown.
- Robots do **not** navigate Waypoint video.
- Third-person Waypoint postponed.
