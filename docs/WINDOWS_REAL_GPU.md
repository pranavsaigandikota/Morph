# Exact Windows commands — real-GPU validation (required before merge)

Cloud cannot reach your GPU. Run these on the Windows machine with Codex Waypoint + SDXL on `:8000`.

## A. Start stack

```powershell
# Terminal 1 — Codex Waypoint already running on http://127.0.0.1:8000
Invoke-WebRequest http://127.0.0.1:8000/healthz

# Terminal 2 — frontend
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift   # adjust clone path
git fetch origin
git checkout cursor/game-experience-cd95
git pull origin cursor/game-experience-cd95
npm install
Copy-Item .env.example .env -Force
# Ensure: VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
# Do NOT set USE_MOCK_ENGINE
npm run dev
```

Open http://127.0.0.1:4821

## B. Create Anything (SDXL)

1. Open `/create`
2. Creative prompt + style → **Generate World**
3. Confirm response matches `docs/codex/SCENE_API.md` (after that file is in-repo)
4. **Start Exploring** with the new seed

## C. World Explorer (Waypoint stream)

1. `/world` → green **LIVE**, no MOCK
2. WASD move · click / drag-look
3. HUD: Gen FPS ≈ Codex baseline (~72), Disp FPS ≈ ~18, Decode Err = 0
4. Sustain ≥ 60–120 s
5. Pause / resume / reset once

```powershell
# Terminal 3 — 60s harness against real engine
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift
$env:ENGINE_URL = 'http://127.0.0.1:8000'
$env:DURATION_MS = '60000'
npm run test:stream60
```

## D. Offline surfaces (GPU can be stopped)

```powershell
# Optional: stop Waypoint. Frontend may keep running.
Start-Process 'http://127.0.0.1:4821/mission'
Start-Process 'http://127.0.0.1:4821/agents'
Start-Process 'http://127.0.0.1:4821/simulation'
```

Confirm: five missions (after RescueGame zip), restart / win / loss / score / stars; Showdown rates unchanged; replays scrub.

## E. Pass criteria (merge gate)

| Check | Pass |
|-------|------|
| Create → Explore LIVE | Yes |
| Gen / Disp FPS near Codex baseline | ~72 / ~18 |
| Decode errors | 0 |
| RescueGame five missions offline | Yes |
| Showdown Random / Guided PPO / A* rates | Unchanged |
| No silent MOCK when `:8000` down | Explorer = unavailable |

Record results in `docs/VALIDATION_STATUS.md` before merging PR #1.
