# Windows startup — WorldShift AI + Codex Waypoint

## What needs what

| Mode | Needs |
|------|--------|
| **Rescue Lab / Agent Eval** | Node.js only + `public\data\rescue\` |
| **World Explorer (genuine video)** | Codex Waypoint GPU server on `http://127.0.0.1:8000` |

This cloud VM **cannot** reach your local `:8000`. Mock protocol tests run in CI/cloud; **WASD/mouse on real frames must be validated on your Windows PC**.

## One-time setup

1. Install **Node.js LTS** — https://nodejs.org  
2. Clone/open this project folder.  
3. Ensure Codex Waypoint is running (verified ~71.7 gen FPS).  
4. Optional: copy a Rescue Lab handoff ZIP into `public\data\rescue\` (keep `manifest.json`).

## Launch (minimal)

**Double-click** `start-windows.bat`  
or PowerShell:

```powershell
.\start-windows.ps1
```

Opens **http://127.0.0.1:4821**

Config (optional `.env`):

```
VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
```

## Validate World Explorer on your GPU PC

1. Confirm Codex: open `http://127.0.0.1:8000/healthz` (or `/readyz`).  
2. `npm run dev` (or the `.bat`).  
3. Open World Explorer → connection banner should say **Waypoint GPU connected** (not MOCK).  
4. Start session → click canvas for pointer lock → WASD + mouse.  
5. Telemetry: **Gen FPS** ≈ wire JPEGs (~70+), **Disp FPS** ≈ canvas draws (~20).  
6. Confirm **MOCK** badge is **absent**.

Until those steps pass on your PC, World Explorer integration is **not** considered complete.

## Mock-only frontend (no GPU)

```powershell
$env:USE_MOCK_ENGINE="1"
npm run dev
```

Shows an explicit **MOCK** badge — never treat as genuine Waypoint.

## Create World

`/create` uses a typed scene adapter. Without `VITE_SCENE_API_BASE_URL` it builds a **MOCK seed** (labeled). Waypoint does **not** process the text prompt; text→image does.

## Docs

- Protocol: `docs/WAYPOINT_PROTOCOL.md`  
- If you receive `FRONTEND_INTEGRATION.md` from Codex, place it in `docs/` — if it disagrees with Phase-2 `/stream`, flag the discrepancy before changing the client.
