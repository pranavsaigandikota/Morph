# Running WorldShift on Windows

| Piece | Requirement |
|-------|-------------|
| **World Explorer (genuine video)** | Codex Waypoint GPU server on `http://127.0.0.1:8000` |
| **Rescue Lab** | Static files in `public/data/rescue/` only |
| **Frontend** | Node.js LTS; Vite on port **4821** |

## Quick start

```powershell
Copy-Item .env.example .env -Force
npm install
npm run dev
```

Or: `.\start-windows.ps1` / `start-windows.bat`

Opens **http://127.0.0.1:4821**

```
VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
```

If `:8000` is down, World Explorer shows a **connection error** — it does **not** silently switch to mock. For protocol-only testing:

```powershell
npm run dev:mock
```

## Full GPU verification

Follow **[WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md)** (WASD, mouse, 60s harness, LIVE badge, Rescue offline).

## Create World

`/create` builds a seed image. Without `VITE_SCENE_API_BASE_URL`, seeds are labeled **MOCK**. Waypoint does not consume the text prompt.
