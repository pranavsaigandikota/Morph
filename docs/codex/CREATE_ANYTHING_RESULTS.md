# Create Anything verification — 2026-10-10

Implemented in existing local workspaces, without changing Waypoint backend/service/protocol or benchmark configuration. All seven preservation hashes match. Optional SDXL style is validated and persisted; numeric generation seeds are exposed in the existing form; existing saved-scene cards now fetch server metadata. Eight backend contract tests and TypeScript/production build passed (existing large-bundle warning remains). RescueEnv/PPO/third-person code untouched.

| Test | Genuine generated FPS | Browser canvas FPS | Duration |
|---|---:|---:|---:|
| New React enchanted forest | 70.81 | 17.93 | 77.50s |
| Original facility, WebSocket receive baseline | 71.78 | not measured | 60.02s |
| Prior guarded React baseline (preserved) |70.46|17.74|117s|

New forest: input ACK RTT p50/p95 1.30/3.80ms; applied-control-to-canvas p50/p95 100.80/137.70ms. Batch p50/p95 56.35/59.14ms. 5488 genuine server frames; 1390 canvas draws; 4101 deliberate presentation skips; zero server drops, ID gaps, ordering, decode or protocol errors. Last-boundary difference of queued/drawn/skipped counters is not silently counted as a drop. Controls applied W/A/S/D in {'w': 265, 'a': 266, 's': 267, 'd': 253} batches and both mouse axes in 7 batches. Inputs use the unchanged real CtrlInput mapping; prior isolated control-to-pixel checks remain preserved. This repeated-scene test checks applied controls and real changing JPEGs, not a new randomized causal study.

The browser retains the existing20FPS presentation cap, bounded3-frame queue and8-credit transport. Actual17.93FPS is close to that cap; GPU generation remains70+. The client distinguishes wire-received FPS from canvas-drawn FPS; server metrics count only genuinely decoded generation. Presentation skips are separate from transport/server drops. No interpolation was added. Browser timing uses its own monotonic clock and echoed control timestamps; server/client clock subtraction is never used.

Memory: forest PyTorch reserved 2100MiB, allocated 1801.78MiB, process phase peak reserved 7220MiB. Peak includes image-generation phase, not an inference-only peak. No OOM occurred. Six repeated preset switches plus two React creations remained at Waypoint load_count1. This is a short-session memory check, not proof of absence of leaks over hours.

Six curated local SDXL Turbo presets generated in 3.03–8.28s (first includes loading; warm about3s). Each was image-inspected and initialized through actual Waypoint, streamed 2427 total decoded JPEGs, exercised WASD/mouse controls, pause/reset/resume and WS reconnect, with zero decode failures. Reset epochs advanced for every preset. Identical cyberpunk prompt/style/seed/steps reproduced an identical PNG SHA256; see seed-reproducibility.json.

React demonstrated generate forest → explore → pause/reset/resume/reconnect → Create World → generate Florida hurricane → explore/drag/pause with no application or model restart. `react-lifecycle.json` and `scene-switch-react.json` preserve DOM telemetry. The second world is a short functional test, not a60-second hurricane FPS claim. Server images/metadata persist under saved_scenes. No frontend redesign was performed.

Pointer lock remains unresolved in the tested in-app browser. Canvas was connected; a real click still returned pointerlockerror, pointer_lockedfalse. Earlier investigation recorded WrongDocumentError in the embedded/automated browser. Catch coverage now handles synchronous exceptions as well as rejected Promises/events. Drag fallback worked after scene changes. Successful native capture in the intended judge browser remains unverified.

Drift remains: prolonged navigation in the forest showed a close view dominated by path stones; displacement and semantic drift cannot be separated quantitatively from this screenshot. Existing official reset clears KV/VAE/context and restored the forest opening view (`WorldShift-Forest-Reset.png`), losing exploration position. No cache configuration changes or unsupported geometry/physics mitigations were introduced.

Raw evidence: creative-react-before/after/report.json, batches-382b11a42fac4fd1966086f2f62af698.jsonl, baseline-facility60.json, preset-validation.json, seed-reproducibility.json, preservation-create-anything.json. Startup/fallback and judges script: CREATE_ANYTHING_DEMO.md. Protocol: FRONTEND_INTEGRATION.md, SCENE_API.md, live OpenAPI snapshot. Environments/models/original verification archives remain preserved.
