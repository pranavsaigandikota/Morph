# Waypoint stream protocol (Codex-aligned)

World Explorer speaks the **Waypoint Phase-2 / Biome-compatible** live protocol documented in the Waypoint-1.5 serving harness (`run/server/app/stream/envelope.py`, `routers/stream.py`, `docs/13-action-and-input-space.md`).

This is the contract Codex’s local inference server is expected to expose on **`http://127.0.0.1:8000`**.

## Discoverability

| Method | Path | Notes |
|--------|------|--------|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Engine loaded / mode |
| GET | `/status` | mode, model, temporal_compression, busy |
| GET | `/actions` | Keycap / VK map |
| GET | `/seeds` | Seed image names |
| WS | `/stream?seed=` | Live interactive stream |

## Hello (text JSON)

```json
{
  "type": "hello",
  "session_id": "…",
  "engine": "RealClipEngine",
  "width": 1280,
  "height": 720,
  "temporal_compression": 4,
  "seed": "…"
}
```

Set `"mock": true` only for non-genuine engines. The UI shows **MOCK** vs **LIVE** from this flag / engine name.

## Binary batch envelope (little-endian)

One WebSocket **binary** message per `gen_frame` batch:

```
[uint32 header_len][JSON FrameHeader]
[uint32 sub_count]
  × [uint32 jpeg_len][JPEG bytes]
```

`FrameHeader`:

```json
{
  "frame_id": 0,
  "gen_ms": 42.5,
  "temporal_compression": 4,
  "client_ts": 12345.6
}
```

`client_ts` echoes the browser `performance.now()` from the last control for RTT.

## Control (text JSON @ ~30 Hz)

```json
{
  "type": "control",
  "buttons": ["W", "SHIFT"],
  "dx": 0.12,
  "dy": -0.04,
  "scroll": 0,
  "ts": 12345.6
}
```

- `buttons` — held-set keycaps (`W/A/S/D`, arrows, `SPACE`, `SHIFT`, `MOUSE_*`)
- `dx`/`dy` — look velocity, client-clamped to `[-1, 1]` (server accumulates + re-clamps per step)
- `scroll` — ternary `{-1,0,1}`, latest-wins

## Frontend metrics

| Metric | Source |
|--------|--------|
| **Generated FPS** | Count of JPEG sub-frames received from envelopes (independent of presentation drops) |
| **Displayed FPS** | Frames painted to the `<img>` / canvas |
| **Pres. Skips** | Intentional client presentation-queue skips (stale frames) |
| **Decode Err** | Invalid JPEG / envelope decode failures |
| **Srv Drops** | True server-side drops when the backend reports them |
| **Latency** | EWMA of `now - client_ts` when echoed |

Presentation queue is capped (`MAX_PRESENTATION_QUEUE = 3`); dropping never reduces reported generated FPS.

## Pause / reset (frontend)

Real Phase-2 servers accept **only** `type:"control"` text messages (other types ignored).

| UI action | Behavior |
|-----------|----------|
| Pause | Client-side: stop presenting; send idle `control` (empty buttons, dx/dy/scroll 0) |
| Reset | Close WS + reconnect to `/stream` (new session) |
| Disconnect | Close WS intentionally (no auto-reconnect) |
| Reconnect | Open `/stream` again |

## Dev wiring

```bash
# Real Codex only (no silent mock if :8000 is down)
npm run dev

# Explicit protocol mock
npm run dev:mock

# 60s navigation harness
ENGINE_URL=http://127.0.0.1:8000 npm run test:stream60
ENGINE_URL=http://127.0.0.1:4822 npm run test:stream60
```

Vite proxies browser `/engine/*` → `ENGINE_TARGET` (HTTP + WS).

## Doc reconcile

When Codex provides `FRONTEND_INTEGRATION.md` / verification ZIP, compare here and correct **only** real wire incompatibilities. Current client matches the public Phase-2 envelope + control contract (`Gxmestk/overworld-waypoint-1.5` reference).
