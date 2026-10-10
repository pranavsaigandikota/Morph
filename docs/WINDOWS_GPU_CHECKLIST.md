# Exact Windows steps — test World Explorer against real Codex Waypoint

> Superseded in detail by **[WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md)** (clone + 60s harness + Rescue offline).  
> World Explorer is **not complete** until that checklist passes on your GPU PC.  
> The cloud agent cannot reach `127.0.0.1:8000` on your machine.

## Short checklist

1. Codex Waypoint up: `Invoke-WebRequest http://127.0.0.1:8000/healthz`
2. `npm install` → copy `.env.example` → `.env` (`VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000`)
3. `npm run dev` — **do not** set `USE_MOCK_ENGINE` (no silent mock fallback)
4. Open http://127.0.0.1:4821/world → green **LIVE**, no MOCK badge
5. Start Exploring → pointer lock → WASD + mouse change pixels
6. Telemetry: Gen FPS (wire), Disp FPS (~20 paints), Pres. Skips OK (client queue), Decode Err not OK; Srv Drops when backend reports them
7. Pause / Reset / Reconnect
8. `$env:ENGINE_URL='http://127.0.0.1:8000'; npm run test:stream60`
9. Stop Codex → Rescue Lab at `/simulation` still loads static JSON; World Explorer shows connection error (not MOCK)

When all boxes pass, mark real GPU integration complete in `VALIDATION_STATUS.md`.
