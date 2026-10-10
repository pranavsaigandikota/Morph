# Codex / Grok handoff for Cursor

Authoritative entry point for integration/codex-grok-handoff. Based on Cursor commit 9685845b214ed46595b95fac7753edae9a2b92b5; no merge into main or Cursor's branch. Page components, simulator implementation and static evaluation data are unchanged relative to that base. Backend source/environment are unchanged and remain on the Windows GPU machine; this branch does not ship model weights or a replacement inference engine.

Read SCENE_API.md for the implemented SDXL contract, FRONTEND_INTEGRATION.md for verified wire details, and CURSOR_INTEGRATION_218S.md for accepted benchmark and final compatibility checks. The three Create Anything source documents are copied byte-for-byte from the actual local outputs. Historical startup paths in those documents refer to earlier validation checkouts; use the procedure below for this branch.

## One Windows startup procedure

In a local clone/worktree of this integration branch:

```powershell
# First frontend dependency installation only (do not recreate GPU environments):
npm.cmd ci
# From this checkout; existing backend .venv/model cache are prerequisites:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-WorldShift.ps1 -BackendRoot 'C:\Users\filma\Documents\Morph\Codex Plus'
```

Open http://127.0.0.1:4821/create. The launcher reuses a healthy backend and starts the composed Waypoint/SDXL service only if absent; SDXL loads lazily. It starts React on 4821 and verifies the served adapter. It never starts a mock engine. Logs and owned process IDs are in the backend's work/startup-logs folder. Backend reuse and actual frontend process launch were tested; the cold backend launch uses the existing validated scene_service entry point and was not repeated solely to restart the resident model.

Port4821 already occupied: ensure it is this checkout; otherwise stop only that frontend's known PID before rerunning. Port8000 occupied by an unexpected service: resolve it before launching another GPU model. Health is GET http://127.0.0.1:8000/health with model_loaded:true, quant:fp8w8a8; status is ready/running/paused, not 'ok'. Loading/error messages must remain visible.

The development proxy /engine supports both HTTP and WebSockets and forwards an already allowed loopback Origin. Direct frontend access from port4821 needs WORLDSHIFT_ORIGINS including http://127.0.0.1:4821 on the next planned backend startup (see FRONTEND_INTEGRATION.md). Do not restart the model just for the proxy flow. A production build/preview does not inherit Vite's dev proxy; configure direct CORS/WS origins or a deployment proxy explicitly.

## Actual protocol and corrections

| Earlier frontend assumption | Implemented service / adapter |
|---|---|
| /healthz, /readyz, /status, status:'ok' | GET /health, model_loaded and actual state |
| /stream?seed=... | POST /world/start then /world/stream?session_id=... |
| Custom binary batch envelope | Text type:'frame' metadata then one complete binary JPEG |
| hello contains dimensions/session/model | Adapter uses known session/model/dimensions; hello supplies controller/epoch/credits |
| Look values normalized; commands sent on every event | Raw relative mouse pixels accumulated; 20Hz full WASD snapshots |
| No receive credits | display_ack per consumed/skipped frame, correct epoch |
| Immediate scene image response; fallback /generate paths | HTTP202 job_id/poll_url, poll until ready/error, read metadata |
| width/height and unsupported scene fields | prompt, style, seed, steps:4, perspective:'first_person' only |
| Numeric generation seed used as WS scene token | Saved scene_id resolved to world_start_request; numeric seed retained separately |
| Browser-only lifecycle | POST /world/pause/resume/reset/stop; switch stops old owned session then starts saved image |
| Dropped combines display decisions/errors | Pres. Skips, Decode Err and Srv Drops remain separate |

Native backend WS: ws://127.0.0.1:8000/world/stream?session_id=<id>. Dev browser WS: ws://127.0.0.1:4821/engine/world/stream?session_id=<id>. Set binaryType='arraybuffer'. Each JPEG begins FF D8 and corresponds to the preceding JSON metadata; dimensions 640x360, batch_size4, epoch/seq identify reset/input application. See FRONTEND_INTEGRATION.md for the exact field schema.

```javascript
// After POST /world/start has returned session_id:
const ws = new WebSocket(`ws://127.0.0.1:4821/engine/world/stream?session_id=${encodeURIComponent(session_id)}`);
ws.binaryType = 'arraybuffer';
let meta;
const t0 = performance.now();
ws.onmessage = async ({ data }) => {
  if (typeof data === 'string') {
    const m = JSON.parse(data);
    if (m.type === 'frame') meta = m;
    else if (m.type === 'control_ack') console.log('ack RTT ms', performance.now() - t0 - m.timestamp_ms);
    else if (m.type === 'error') console.error(m);
    return;
  }
  const m = meta; meta = undefined;
  if (!m) throw new Error('JPEG without frame metadata');
  try {
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  } finally {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'display_ack',frame_id:m.frame_id,epoch:m.epoch,client_elapsed_ms:performance.now()-t0}));
  }
};
// Send current full key state at 20Hz; accumulate and clear relative mouse deltas.
ws.onopen = () => ws.send(JSON.stringify({type:'control',seq:1,keys:['w'],mouse_dx:0,mouse_dy:0,timestamp_ms:performance.now()-t0}));
```

The tiny example illustrates the envelope; the tested hook additionally bounds decode/render queues, ignores stale sockets, tracks counters and handles full lifecycle. ACK displayed AND deliberately skipped frames. Do not subtract the server monotonic timestamp from the client clock. Handle HTTP422 validation,404 unknown session/scene,409 active world/job,503 load failure; display backend errors. Disconnect alone does not free the world. Reset increments epoch, keeps frame IDs monotonic, preserves pause, and returns to the original seed. Before SDXL generation, stop an active or paused world; never silently substitute mock pixels on error.

## Saved-image fallback

Six real SDXL PNGs plus original metadata/hashes are in integration/codex-presets (cyberpunk, forest, alien, underwater, floating islands, Florida hurricane). Import on the Windows backend machine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integration\codex-presets\Import-DemoPresets.ps1 -BackendRoot 'C:\Users\filma\Documents\Morph\Codex Plus' -PresetDirectory '.\integration\codex-presets'
```

The importer verifies hashes, skips identical images, and rewrites machine-local seed paths. Stop/disconnect an owned world before switching via a fresh page. Open http://127.0.0.1:4821/world?seed=6a956ff381904a0cb91f2d068dd888b1 for the saved Florida hurricane. This starts real Waypoint without running SDXL. Resolve GET/scenes/<id> at runtime; do not hardcode another machine's absolute image path. Existing browser bookmarks are local to that browser, whereas the backend saved-scene API lists persistent scenes.

## Grok package and boundaries

integration/rescue-play/rescue_play.zip is the original 1,195,950-byte ZIP, unmodified. Separate INTEGRATION.md is the matching archive member. Integrity passed,72 files; inspection found no listed credential signatures or dependency/cache directories. See rescue-package-inspection.json for SHA256 and inventory. Its dist files are deliverable compiled library assets, not generated dependency installs. The package is available for Cursor to integrate; this handoff does not replace the current Rescue Mission simulator or certify official parity.

Known limits: pointer lock unreliable; verified drag-look retained. Long-session visual drift; reset clears history. First-person only, no native Waypoint text conditioning, persistent geometry or dependable collision guarantee. Explorer supports WASD/look; no arrows/jump/sprint/wheel claim. Rescue Mission's separate discrete arrow/WASD controls are unrelated to video input.

Build: npm.cmd run build. Live contract test: $env:SESSION_ID='<active session>'; node scripts/verify-codex-contract.mjs. Offline tests: npm.cmd run test:rescue. These tests are separate from genuine GPU performance measurements. Full changed-file list: CHANGED_FILES.txt. No force push, no merge, no frontend redesign.
