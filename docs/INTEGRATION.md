# WorldShift AI — Backend Integration Guide

## World Explorer → Waypoint (priority)

The AI World Explorer connects to **Codex’s Waypoint inference server** using the Phase-2 protocol. See **[WAYPOINT_PROTOCOL.md](./WAYPOINT_PROTOCOL.md)** for the authoritative wire format.

| | |
|--|--|
| Default origin | `http://127.0.0.1:8000` |
| Browser proxy | Vite `/engine` → `ENGINE_TARGET` |
| Stream | `WS /stream?seed=` |
| Frames | Binary JPEG batch envelopes (not mock PNG when live) |
| Controls | `{ type:"control", buttons, dx, dy, scroll, ts }` @ ~30 Hz |

```bash
# Auto: prefer :8000, else protocol mock :4822
npm run dev

# Force Codex
ENGINE_TARGET=http://127.0.0.1:8000 npm run dev

# 60s harness
ENGINE_URL=http://127.0.0.1:8000 npm run test:stream60
```

Client code: `src/services/waypointEnvelope.ts`, `src/hooks/useWorldStream.ts`.

## Simulation & agents (mock)

Still served by the local mock on `:4822` via `/api`:

- `POST /simulations`, `POST /simulations/{id}/step`, `GET …/replay`
- `POST /agents/evaluate`, `GET /agents/replays/{id}`

Rescue Lab is secondary until World Explorer is playable on real Waypoint frames.

## Metrics policy

- **Generated FPS** — JPEG sub-frames received from the engine (matches Codex “genuine generated/decoded FPS”).
- **Displayed FPS** — browser paints only.
- Presentation queue bounded; drops do **not** reduce generated FPS.
