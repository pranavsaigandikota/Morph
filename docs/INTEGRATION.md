# WorldShift AI — Backend Integration Guide

This frontend speaks the hackathon contracts through typed adapters. Swap the mock server for the real world engine without rewriting UI code.

## Base URLs

| Mode | HTTP | WebSocket |
|------|------|-----------|
| Local mock (default) | Vite proxies `/api` → `http://127.0.0.1:4822` | `/ws` → `ws://127.0.0.1:4822` |
| Custom | Set `VITE_API_BASE` | Set `VITE_WS_BASE` |

Example:

```bash
VITE_API_BASE=https://engine.example.com VITE_WS_BASE=wss://engine.example.com npm run dev:web
```

## World engine

### `POST /world/start`

```json
{
  "scene_id": "facility",
  "seed_image_path": null,
  "prompt": "First-person industrial research facility"
}
```

Response: `{ "session_id": "...", "status": "starting" }`

### `WS /world/stream?session_id=<id>`

**Client → server (JSON text):**

```json
{
  "type": "control",
  "seq": 1,
  "keys": ["w"],
  "mouse_dx": 0,
  "mouse_dy": 0,
  "timestamp_ms": 0
}
```

Also supported: `{ "type": "pause" }`, `{ "type": "resume" }`.

**Server → client (mock v1 framing):**

1. Text JSON `frame_meta`
2. Binary image bytes (`image/png` in the mock)

```json
{
  "type": "frame_meta",
  "frame_id": 12,
  "sequence": 12,
  "generated_at_ms": 1710000000000,
  "inference_ms": 42,
  "width": 640,
  "height": 360,
  "mime": "image/png",
  "mock": true,
  "dropped_since_last": 0
}
```

### Transport adapter

`src/services/worldTransport.ts` isolates framing. It already includes helpers for a future single binary envelope (`WSF1` magic + meta length + JSON + image). Point the engine team at that file when finalizing the wire format.

### Other world endpoints

- `POST /world/reset` — `{ "session_id" }`
- `POST /world/stop` — `{ "session_id" }`
- `GET /world/metrics?session_id=`
- `GET /health`

## Simulation

- `POST /simulations` → `{ id, status, map_id }`
- `POST /simulations/{id}/step` → `{ id, step, state, done }`
- `GET /simulations/{id}`
- `GET /simulations/{id}/replay`

Maps include walls, hazards, exits, and spawn. The UI never derives geometry from generative video.

## Agents

- `POST /agents/evaluate` — `{ agent_id, scenario_id, episodes? }`
- `GET /agents/replays`
- `GET /agents/replays/{id}`

## Client buffering policy

The world viewer keeps at most one in-flight frame URL. Older object URLs are revoked immediately. Control packets are sent at 30 Hz; display FPS is measured client-side.

## MOCK indicator

While `mock: true` is present on frame meta or metrics, the UI shows an explicit **MOCK** badge. Real engines should omit `mock` or set it to `false`.
