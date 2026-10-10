# WorldShift AI

**Create. Explore. Survive. Adapt.**

First-person **Waypoint** worlds (Codex GPU) + interactive **Rescue Missions** + verified **AI Showdown**.

## Modes

| Route | Purpose |
|-------|---------|
| `/create` | Create Anything — HQ SDXL contact sheet (approve before Waypoint) + Turbo secondary |
| `/calibrate` | Optional MOCK **user-guided** calibration (Capture View; no auto fixed-angle) |
| `/world` | World Explorer — product native **1280×720** Waypoint |
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
| `npm run test:hq-starters` | HQ approval / recovery policy checks |
| `npm run test:world-memory` | World memory MOCK + unsuitable anchors |

HQ contact sheet (Windows GPU, experimental HIGH API): `.\scripts\Generate-HqStarterContactSheet.ps1` — see [docs/world-memory/HQ_STARTER_APPROVAL.md](docs/world-memory/HQ_STARTER_APPROVAL.md). Early Waypoint frames are **not** recovery anchors.

## Notes

- **Product resolution:** native **1280×720 only** — no 360p selector, fallback, or demo mode. See [docs/PRODUCT_NATIVE_720P.md](docs/PRODUCT_NATIVE_720P.md). Stream-adapter rewrites wait for Codex’s validated 720p contract.
- Rescue Missions & Showdown work from `public/data/rescue/` without a GPU.
- Guided PPO metrics assume shortest-path access — labeled on Showdown.
- Robots do **not** navigate Waypoint video.
- Third-person Waypoint postponed.
- Older Git releases that assumed 360p are retained for recovery only, not as product features.
