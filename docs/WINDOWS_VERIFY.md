# Windows real-GPU verification (Codex Waypoint)

World Explorer is **not** integration-complete until this checklist passes on your GPU PC.
Cloud agents cannot reach `127.0.0.1:8000` on your machine.

## Prerequisites

1. Codex Waypoint already running and GPU-tested on **`http://127.0.0.1:8000`**
2. Node.js LTS installed
3. This frontend repo cloned locally (see clone commands below)

## Clone, install, start (PowerShell)

Replace `<REPO_URL>` with the URL from Cursor **Create repo** (required for a durable clone).

```powershell
# 1) Clone
New-Item -ItemType Directory -Force -Path "C:\Users\filma\Documents\Morph\Cursor Pro" | Out-Null
Set-Location "C:\Users\filma\Documents\Morph\Cursor Pro"
git clone <REPO_URL> WorldShift
Set-Location WorldShift
git checkout main
git log -1 --oneline   # confirm commit SHA

# 2) Install + env
npm install
Copy-Item .env.example .env -Force
# Confirm .env contains:
# VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000

# 3) Confirm Codex is up BEFORE starting the frontend
Invoke-WebRequest http://127.0.0.1:8000/healthz
# optional: /readyz /status

# 4) Start frontend (does NOT auto-start mock if :8000 is down)
npm run dev
```

Open:

- UI: http://127.0.0.1:4821
- World Explorer: http://127.0.0.1:4821/world
- Rescue Lab: http://127.0.0.1:4821/simulation

## Explicit mock only (optional — not the GPU path)

```powershell
# Stop npm run dev first (Ctrl+C), then:
npm run dev:mock
# or: $env:USE_MOCK_ENGINE='1'; npm run dev
```

The orange **MOCK** badge must appear. Do not treat this as a GPU pass.

## Real integration acceptance

With Codex on `:8000` and `npm run dev`:

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | Connection banner | Green LIVE — **no** MOCK badge |
| 2 | Start Exploring | Canvas shows generated frames |
| 3 | Pointer lock | Click canvas; mouse look changes pixels |
| 4 | WASD | Hold W/A/S/D — generated scene responds |
| 5 | Telemetry | Gen FPS and Disp FPS update |
| 6 | Continuity | No sustained envelope/decode errors |
| 7 | Pause / Resume | Presentation pauses; resume continues |
| 8 | Reset | New session / fresh stream |
| 9 | Reconnect | Recovers after brief disconnect |
| 10 | 60s harness | See below |

### 60-second interactive harness (metrics)

In a second PowerShell window (frontend may keep running):

```powershell
Set-Location "C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift"
$env:ENGINE_URL = 'http://127.0.0.1:8000'
$env:DURATION_MS = '60000'
npm run test:stream60
```

Record from the report JSON:

- `generated_fps`
- `latency_ms_avg` / `latency_ms_p95`
- `bad_jpeg` / `bad_envelope`
- `hello.engine` (must not be mock)
- `mock` must be `false`

In the browser overlay also note:

- **Disp FPS** (~canvas paints, often ~20 by design)
- **Dropped** (presentation-queue drops are OK; decode errors are not)

## Rescue Lab without GPU

```powershell
# Stop Codex Waypoint entirely, keep frontend running (or restart with npm run dev)
# Open:
Start-Process 'http://127.0.0.1:4821/simulation'
```

Rescue Lab must still load maps / trajectories / charts from `public/data/rescue/` via `fetch`. World Explorer correctly shows **connection unavailable** (not MOCK).

## Launcher scripts

```powershell
.\start-windows.ps1
# or double-click start-windows.bat
```

## After Codex docs arrive

Place Codex’s `FRONTEND_INTEGRATION.md`, `INTERACTIVE_VERIFICATION.md`, and verification ZIP under `docs/`. Reconcile against `docs/WAYPOINT_PROTOCOL.md` and fix **only** real wire incompatibilities before claiming GPU pass.
