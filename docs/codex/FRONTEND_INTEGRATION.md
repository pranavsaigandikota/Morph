# WorldShift: authoritative local integration

Verified on the Windows RTX 4070 Ti SUPER on October 10, 2026. Frontend source commit: `a0924b63c72ec069f80e645ab0080df4a31808bf`; local integration branch: `codex/local-waypoint-integration`. Stable inference source and benchmark configuration remain byte-identical to `preservation/baseline-hashes.json`.

## Windows startup

Backend already running on port 8000: **do not launch a second copy**. Health reports the model load count and state.

```powershell
Set-Location 'C:\Users\filma\Documents\Morph\Codex Plus'
Invoke-RestMethod http://127.0.0.1:8000/health
# On a fresh launch, choose ONE:
.\start-with-scenes.ps1  # validated inference plus optional local SDXL scenes API
# .\start.ps1           # preserved inference-only fallback, no scenes API
```

Frontend dependencies and `.env` are installed/configured locally. Commands below use Windows-safe npm invocation. `npm run dev:real` contains Unix environment syntax in the original repository; use `npm.cmd run dev` on Windows instead.

```powershell
Set-Location 'C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift'
# First installation only:
npm.cmd ci
Copy-Item .env.example .env  # only if .env does not already exist
# .env: VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000
npm.cmd run build
npm.cmd run dev
```

Open `http://127.0.0.1:4821/world`. Local branch fixes Windows Vite child-process launching. The dev server proxies `/engine/*` to port 8000. Its explicit loopback Origin header uses the service's already allowed `http://127.0.0.1:3000`, so the GPU process required no CORS restart. This proxy is only a dev integration convenience; it does not change the wire format or infer frames.

For **direct** cross-origin requests from port 4821, set this before the next planned backend launch:

```powershell
$env:WORLDSHIFT_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,http://localhost:4821,http://127.0.0.1:4821'
.\start-with-scenes.ps1
```

Use exact origins including scheme/port. WS origin checking is separate from HTTP CORS. The default supports ports 3000 only. Frontend `/world` is a React route; backend `/` is 404.

## Existing HTTP API

| Request | Implemented behavior |
|---|---|
| `GET /health` | `status`, `model_loaded`, `error`, `model`, `quant`, `model_load_count`, `prompt_conditioning` |
| `POST /world/start` | Creates one world; returns `session_id`, `status:"starting"`, `prompt_conditioning:false`, `prompt_status:"metadata_only"` |
| `POST /world/pause` | Preserves history, stops generation |
| `POST /world/resume` | Continues history, clears input state |
| `POST /world/reset` | Restores cached original seed/history, advances epoch, retains paused state |
| `POST /world/stop` | Clears world/history and releases slot; GPU model stays loaded |
| `GET /world/metrics` | Genuine generated counters, server elapsed seconds, batch/inference p50/p95, drops, PyTorch memory |

Start body:

```json
{"scene_id":"facility","seed_image_path":null,"prompt":"First-person industrial research facility"}
```

All lifecycle POST bodies are `{"session_id":"<id>"}`. Seed paths refer to files on the **backend PC**, not browser uploads. One world supports up to four viewers; the first socket controls it. The patched React application owns one world. Disconnect calls stop; reconnect while active retains the same world/history. Reset retains its session ID and restores the initial image, losing navigation position. A WS disconnect alone does not stop the world; without viewers it stops generating and preserves history.

The patched owning React component explicitly sends keepalive stop on pagehide/component exit, and stops abandoned start responses. This prevents a page reload from orphaning a busy world. Unexpected WS reconnects retain ownership/history; intentional page exit releases it. Reload cleanup was verified without a model reload.

The service does **not** implement `/healthz`, `/readyz`, `/status`, `/actions`, `/seeds`, or `/stream`. Cursor's original Phase-2 contract describes a different server. It must not be used to decode this service.

## Exact WebSocket contract

Direct URL: `ws://127.0.0.1:8000/world/stream?session_id=<id>`.

Vite dev URL: `ws://127.0.0.1:4821/engine/world/stream?session_id=<id>`.

Set `binaryType="arraybuffer"`. Every generated frame uses **two consecutive WS messages**:

1. Text JSON `type:"frame"`.
2. One complete JPEG binary message, starting `FF D8`, with **no custom header or length prefix**.

Four real decoded images are emitted per model call, each separately. No little-endian batch envelope, interpolation, duplication, Socket.IO, or prerecorded playback is involved.

Actual first hello:

```json
{"type":"hello","controller":true,"epoch":1,"encoding":"jpeg","max_unacknowledged_frames":8,"clock":"server perf_counter milliseconds; client timestamp echoed unchanged"}
```

Hello does not contain model name, dimensions or session ID. The client obtains model identity from `/health`, session ID from `/world/start`, and dimensions from each frame. The tested checkpoint emits 640×360. Example frame metadata (illustrative values; exact implemented keys):

```json
{"type":"frame","session_id":"<id>","frame_id":1,"batch_id":0,"batch_index":0,"batch_size":4,"epoch":1,"generated_at_ms":1000,"inference_ms":46,"width":640,"height":360,"encoding":"jpeg","seq":1,"client_timestamp_ms":100,"server_input_to_generated_ms":60,"sent_at_ms":1001}
```

Pair metadata synchronously before async decoding. Frame IDs increase across reset; epoch changes indicate a new history. Initial `seq` can be `-1` and echoed timestamps can be `null`. Four frames share batch generation/control timing. `generated_at_ms` is batch completion; `sent_at_ms` is server send time, both server monotonic clocks.

Control at 20 Hz and key changes:

```json
{"type":"control","seq":1,"keys":["w"],"mouse_dx":10,"mouse_dy":-4,"timestamp_ms":123.4}
```

Only lowercase WASD is accepted. Seq is a strictly increasing integer; timestamp is nondecreasing elapsed time on the client's monotonic clock (`performance.now()` or an offset from it). Send the full held-key set. Mouse axes are accumulated relative movement deltas, bounded ±1000, cleared after send. Clear keys on blur. Input expires after 500 ms without refresh. W maps to VK87, A65, S83, D68. Space, Shift, wheel and mouse buttons are unsupported; arrow keys are not exposed as aliases in this patch.

Every accepted control returns:

```json
{"type":"control_ack","seq":1,"timestamp_ms":123.4,"server_received_at_ms":1000}
```

Release credit for every consumed frame, including intentionally skipped presentation frames:

```json
{"type":"display_ack","frame_id":1,"epoch":1,"client_elapsed_ms":150}
```

Eight outstanding frames cap server backlog. This acknowledgement means **consumed**, not drawn. React releases credit after passing the JPEG to its bounded three-frame queue; separate canvas counters record actual unique draws. Omitting acknowledgments causes server drops.

## Timing and telemetry

Genuine generated FPS = delta `/world/metrics.generated_frames` / delta server `elapsed_seconds`. Received FPS counts all delivered JPEGs. Canvas FPS counts successful `drawImage` calls for unique received frames. It does not measure physical monitor presentation. Client presentation skips, server drops, frame-ID gaps, decode failures and ordering errors are separate counters.

Input ack RTT = client receive time minus echoed client timestamp. Applied-control-to-canvas = client draw time minus echoed frame client timestamp, once per new applied seq. Never subtract unsynchronized server/client clocks. Ack means accepted, not necessarily applied; a later input can supersede it. The server-only `server_input_to_generated_ms` is safe to use as a separate server measurement.

React's overlay shows received Gen FPS, canvas Disp FPS, ack RTT, generation latency, presentation skips and PyTorch reserved MiB. Detailed bounded measurement telemetry is DOM-backed at `canvas[data-telemetry]`; before/after snapshots and GPU batch logs accompany the integration report. The original client caps presentation at 20 FPS and skips older burst frames. That setting is preserved.

## Error handling and browser limits

HTTP: 422 invalid schema/seed; 404 unknown session/scene; 409 world/image job busy; 503 loading/model unavailable. Errors expose backend detail rather than silently choosing mock. WS: JSON `type:"error",message`; JSON `type:"status",status,epoch`; invalid origin/session can produce handshake rejection before accept. Controls are allowed only from the controlling socket; handle `type:"controller"` if implementing multiple viewers. Local React retries unexpected disconnections with bounded exponential backoff; intentional disconnect stops and clears the world. Keep an active session ID when reconnecting; do not start a second world after a network interruption.

Pointer lock requests were rejected with `WrongDocumentError` in the tested in-app and automation-controlled Brave sessions. The patch catches the error and supports left-button drag-look on the canvas. WASD and both mouse axes are verified with real browser input and model-applied logs. **Successful pointer lock remains unverified.** Long-session visual drift remains; reset is a supported recovery action with a visible jump to the seed. First-person only. Waypoint itself is not text-conditioned; `/world/start.prompt` is metadata.

## Minimal JavaScript example

Use the supplied unchanged `world-client.js` adapter for a bounded browser client:

```javascript
import {connectWorld} from './world-client.js';
const base = 'http://127.0.0.1:8000'; // origin must be allowed
const r = await fetch(`${base}/world/start`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({scene_id:'facility',seed_image_path:null,
    prompt:'First-person industrial research facility'})
});
if (!r.ok) throw new Error(await r.text());
const {session_id} = await r.json();
const world = await connectWorld(document.querySelector('canvas'), {
  sessionId:session_id, baseUrl:base, onTelemetry:console.log
});
// Real WASD and mouse handlers are installed by the adapter.
// await world.pause(); await world.resume(); await world.reset();
// await world.stop(); // required when the owning component closes
```

For the React product use the focused patch on the specified source commit. The original Phase-2/mock implementation remains recoverable on `main`; this integration branch targets the actual GPU API and has no mock fallback. See `SCENE_API.md` for local prompt-to-image jobs and `WORLD_SHIFT_INTEGRATION_RESULTS.md` for measured acceptance status.
