# 3-minute judging demo — WorldShift AI

**Create. Explore. Survive. Adapt.**

Full Windows GPU steps: [WINDOWS_REAL_GPU.md](./WINDOWS_REAL_GPU.md) · Integration blockers: [INTEGRATION_STATUS.md](./INTEGRATION_STATUS.md)

## Prep (before judges arrive)

```powershell
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift   # or your clone path
git checkout cursor/game-experience-cd95
git pull
npm install
Copy-Item .env.example .env -Force
# Codex Waypoint + SDXL already on http://127.0.0.1:8000
Invoke-WebRequest http://127.0.0.1:8000/healthz
npm run dev
```

Open **http://127.0.0.1:4821**

Confirm LIVE Waypoint (`/world`) and that `/mission` + `/agents` still load with GPU stopped.

---

## Minute 0:00–0:45 — Create Anything

1. Home → **Create**.
2. Freeform prompt (not emergency-themed) + style.
3. **Generate World** → LIVE SDXL seed (orange **MOCK** only if explicitly offline).
4. **Start Exploring**.

## Minute 0:45–1:30 — Explore

1. `/world` → **LIVE** (no MOCK) when Codex is up.
2. WASD · pointer lock or drag-look (only controls we advertise).
3. HUD: Gen FPS (wire) vs Disp FPS (canvas) · Pres. Skips ≠ server loss.
4. Pause / resume once.

## Minute 1:30–2:20 — Rescue Mission

1. Open **Mission** (`/mission`).
2. Play a mission (five maps once RescueGame zip is wired).
3. Show score / stars / win or loss · **Restart**.
4. Toggle **Compare vs A*** (preserve engine path rules).

## Minute 2:20–3:00 — AI Showdown

1. Open **Showdown** (`/agents`).
2. Verified recorded rates (do not invent):
   - Random **19.5% / 8.0%**
   - PPO + Path Guidance **99.5% / 99.0%** (guided — shortest-path info)
   - A* **100% / 100%**
3. Say: **recorded evaluation, not live inference**.
4. Optional: `/simulation` scrub Random / PPO / A* replays.

---

## Failure recovery lines

| Issue | Say / do |
|-------|----------|
| Waypoint down | Connection unavailable (not MOCK). Mission / Showdown still work. |
| SDXL down | Explicit MOCK preview — labeled orange. |
| Pointer lock blocked | Drag-look still works. |

## Do not claim

- Rescue robots navigate Waypoint video pixels.
- Showdown rates are live inference.
- Mock seeds are AI-generated.
- Cloud verified real GPU streaming.
