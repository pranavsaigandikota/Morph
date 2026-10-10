# 3-minute judging demo — WorldShift AI

**Create. Explore. Survive. Adapt.**

## Prep (before judges arrive)

```powershell
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift   # or your clone path
git checkout cursor/game-experience-cd95   # or main after merge
npm install
Copy-Item .env.example .env -Force
# Start Codex Waypoint + SDXL on http://127.0.0.1:8000
npm run dev
```

Open **http://127.0.0.1:4821**

Confirm LIVE Waypoint (`/world` banner) and Rescue still loads with GPU stopped (`/mission`).

---

## Minute 0:00–0:45 — Create Anything

1. Click **Create** (or big CTA on Home).
2. Paste any imaginative prompt (not emergency-themed).
3. Pick a style: cinematic / photorealistic / fantasy / stylized.
4. **Generate World** → show LIVE SDXL seed (or labeled MOCK if offline).
5. Click **Start Exploring**.

## Minute 0:45–1:30 — Explore

1. On `/world`, confirm **LIVE** (no MOCK badge) when Codex is up.
2. WASD move · drag mouse (or pointer lock) to look.
3. Point at Gen FPS vs Disp FPS on the HUD.
4. Pause / resume once.

## Minute 1:30–2:20 — Rescue Mission

1. Open **Mission**.
2. WASD the robot to a green exit on the isometric map.
3. Show steps / collisions HUD.
4. **Compare my route vs A*** (amber trail).

## Minute 2:20–3:00 — AI Showdown

1. Open **Showdown**.
2. Call out verified rates:
   - Random **19.5% / 8.0%**
   - PPO + Path Guidance **99.5% / 99.0%** (has shortest-path info)
   - A* **100% / 100%**
3. Say clearly: **recorded evaluation, not live inference**.
4. Optional: **Replays** for Random / PPO / A* trajectory scrubbing.

---

## Failure recovery lines

| Issue | Say / do |
|-------|----------|
| Waypoint down | Banner shows connection error (not MOCK). Rescue still works. |
| SDXL down | “Use MOCK preview” — labeled orange. |
| Pointer lock blocked | Drag-look still works. |

## Do not claim

- Rescue robots navigate Waypoint video.
- Showdown rates are live inference.
- Mock seeds are AI-generated.
