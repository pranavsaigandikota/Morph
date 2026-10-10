# 3-minute judging demo — WorldShift AI

**Create. Explore. Survive. Adapt.**

Windows startup: [WINDOWS_REAL_GPU.md](./WINDOWS_REAL_GPU.md) · Handoff: [codex/HANDOFF.md](./codex/HANDOFF.md)

## Prep

```powershell
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift   # adjust clone path
git checkout cursor/game-experience-cd95
git pull
npm.cmd ci
Copy-Item .env.example .env -Force   # VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
# Prefer handoff launcher (reuses healthy backend):
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-WorldShift.ps1 -BackendRoot 'C:\Users\filma\Documents\Morph\Codex Plus'
# Optional once: import six presets into backend saved_scenes
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integration\codex-presets\Import-DemoPresets.ps1 -BackendRoot 'C:\Users\filma\Documents\Morph\Codex Plus' -PresetDirectory '.\integration\codex-presets'
```

Open **http://127.0.0.1:4821**

---

## Minute 0:00–0:45 — Create Anything

1. **Create** → freeform prompt + style (optional seed).
2. Or pick one of **six real SDXL presets** (local PNG preview).
3. **Generate World** → LIVE SDXL (or labeled MOCK if offline).
4. **Start Exploring**.

## Minute 0:45–1:30 — Explore

1. `/world` → **LIVE**, no MOCK.
2. WASD · drag-look (pointer lock optional).
3. HUD: Gen FPS · Disp FPS · **Pres. Skips** (not server loss) · Decode Err · Srv Drops.
4. Pause / resume once. Switch world from gallery if available.

## Minute 1:30–2:20 — Rescue Mission

1. `/mission` — five RescueGame missions.
2. One step per WASD/arrow press · D-pad · orange Blocked flash.
3. Reach goal → score/stars · **Compare vs A*** · Restart / Undo.

## Minute 2:20–3:00 — AI Showdown

1. `/agents` — recorded rates: Random **19.5%/8%** · Guided PPO **99.5%/99%** · A* **100%/100%**.
2. Say: **recorded evaluation, not live inference**.
3. Optional `/simulation` replays.

---

## Do not claim

- Cloud verified real GPU streaming.
- Showdown rates are live inference.
- Mock seeds are AI-generated.
- Rescue robots navigate Waypoint video.
