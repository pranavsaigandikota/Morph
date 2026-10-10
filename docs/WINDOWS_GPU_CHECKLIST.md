# Exact Windows steps — test World Explorer against real Codex Waypoint

> World Explorer is **not complete** until this checklist passes on your GPU PC.  
> The cloud agent cannot reach `127.0.0.1:8000` on your machine.

## Prerequisites

1. Codex Waypoint inference already running (you measured ~71.73 gen FPS).
2. Node.js LTS installed.
3. This frontend repo on disk.

## Steps

```powershell
cd <path-to-worldshift-frontend>

# 1) Confirm Codex is up
Invoke-WebRequest http://127.0.0.1:8000/healthz
# or open http://127.0.0.1:8000/readyz in a browser

# 2) Install + configure
npm install
copy .env.example .env
# Ensure .env contains:
# VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000

# 3) Start frontend only (do NOT set USE_MOCK_ENGINE)
npm run dev
```

4. Open **http://127.0.0.1:4821/world**
5. Connection banner must say **Waypoint GPU connected** (green LIVE) — **not** MOCK.
6. Click **Start Exploring** → click canvas for pointer lock.
7. Hold **W** and move the mouse — generated scene must change.
8. Telemetry overlay:
   - **Gen FPS** near Codex’s ~70+ wire rate
   - **Disp FPS** ~ canvas draws (~20)
   - **Dropped** may be > 0 (presentation queue by design)
   - **GPU Mem** shows a value only if the backend supplies it; otherwise “unavailable”
9. Orange **MOCK STREAM** badge must be **absent**.
10. Pause / Resume / Reset / Disconnect / Reconnect each work.

## Pass criteria

- [ ] Connected to real `:8000` (no MOCK badge)
- [ ] WASD affects pixels
- [ ] Mouse look affects pixels
- [ ] No sustained decode/envelope errors in UI
- [ ] Gen FPS and Disp FPS both updating

When all boxes are checked, World Explorer integration can be marked complete.
