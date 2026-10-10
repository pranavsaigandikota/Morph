# Windows startup (minimal steps)

## Prerequisites

1. Install **Node.js LTS** from https://nodejs.org (includes `npm`).
2. (World Explorer only) Run the **Codex Waypoint GPU** server on `http://127.0.0.1:8000`.
3. (Rescue Lab) Ensure `public\data\rescue\manifest.json` exists — copy the data handoff into `public\data\rescue\` if you received a package.

## Start the integrated app

**Double-click** `start-windows.bat`  
or in PowerShell from the project folder:

```powershell
.\start-windows.ps1
```

Then open **http://127.0.0.1:4821**

| Surface | Needs |
|---------|--------|
| Landing / Rescue Lab / Agent Eval | Node + static `public/data/rescue/` only |
| World Explorer (genuine video) | Codex Waypoint on `:8000` |

## Force real Waypoint proxy

```powershell
$env:ENGINE_TARGET = "http://127.0.0.1:8000"
npm run dev
```

## Optional live sim/PPO API (not required)

```powershell
$env:VITE_LIVE_SIM_URL = "http://127.0.0.1:4822"
npm run dev
```

Rescue Lab still defaults to the static package.

## Data handoff refresh

Replace or merge files under `public\data\rescue\`, keep `manifest.json` as the entrypoint, refresh the browser.
