# Accepted real GPU integration benchmark — 218.49 seconds

Measured on Windows, RTX 4070 Ti SUPER, Waypoint 1.5 360P FP8. This is the accepted continuous React/GPU run on Cursor source 0f41168f1f9ee223f95326f6bf6b46c21cba9014 plus the tested adapters. The integration handoff rebases those adapters onto the latest Cursor source; its shorter compatibility checks are separate below.

| Measurement | Result |
|---|---:|
| Continuous browser duration | 218.494 seconds |
| Genuine server-generated FPS | 71.58 |
| Canvas-drawn FPS | 17.96 |
| Generated frames / received / drawn | 15,640 / 15,644 / 3,924 |
| Intentional client presentation skips | 11,718 |
| Server drops / frame gaps / ordering / decoding / protocol errors | 0 / 0 / 0 / 0 / 0 |
| Input acknowledgment RTT p50 / p95 | 1.3 / 3.1 ms |
| Applied-control to canvas p50 / p95 | 100.9 / 135.6 ms |
| Frame-batch latency p50 / p95 | 55.56 / 58.80 ms |
| GPU inference p50 / p95 | 46.28 / 48.69 ms |
| PyTorch reserved / allocated | 2,100 / 1,801.78 MiB |
| Phase peak reserved, including SDXL | 7,220 MiB |
| Waypoint model load count | 1 |

The four-frame received/generated difference comes from measurement boundaries. FPS counts real generated JPEGs, with no interpolation or prerecorded substitutions. Presentation is deliberately capped at 20 FPS with a bounded three-frame client queue; its skips are not network/server loss. Latency uses client monotonic timestamps echoed by the server, never subtraction of unsynchronized clocks. Control-to-canvas measures acknowledged sequence application, not perceived physical movement. Latency statistics use retained bounded samples. PyTorch memory is not total GPU physical memory.

W, A, S and D appeared in 811/801/804/795 generated batches; both mouse axes appeared in nine batches. Native held-button drag-look worked. Pause, reset, resume and reconnect worked. Real SDXL creation through the Create page took 3.965 seconds total (3.638 seconds generation) and initialized a playable Waypoint world: scene 988c77fb0cf44c0181769446013e37a1, seed 3318774346. Waypoint does not interpret text; SDXL generates the seed image.

Rescue Mission and AI Showdown were separate GPU-independent validations: three discrete steps and restart were observed, and the recorded evaluation was explicitly labeled. Existing guided PPO metrics are recorded data, not live training or video results. The bundled Grok RescueGame package is delivered for Cursor integration; official Grok parity is not newly certified here.

## Final handoff checks

Base: latest origin/cursor/game-experience-cd95 at 9685845b214ed46595b95fac7753edae9a2b92b5. Production TypeScript/Vite build passed; existing large-chunk warning remains. All 19 offline Rescue/Showdown checks passed, including Cursor's new discrete-key checks. Real HTTP schema and 16 JSON-metadata/separate-JPEG WebSocket messages passed with credit acknowledgments. Saved hurricane → facility → generated forest switching, WASD, drag-look, reconnect, pause/reset/resume worked in the latest React checkout. Model load count stayed one; frozen backend hashes match.

This shorter lifecycle smoke test is not a repeat of the accepted continuous benchmark. Its final server counter was six discarded queued frames during lifecycle queue clearing; decoding errors were zero. The backend explicitly counts pause/reset queue flushing as drops. These lifecycle discards are reported, not folded into the accepted zero-drop continuous run.

Pointer lock remains unreliable in the in-app browser; drag-look is the verified fallback. Long navigation exhibits visual drift. Reset restores the seed and discards accumulated history/position. No persistent geometry, reliable physical collision, or third-person support is claimed.

Evidence: cursor-three-minute-report.json, cursor-three-minute-before.json, cursor-three-minute-after.json, cursor-lifecycle.json, cursor-sdxl-job.json, cursor-walkthrough.json, handoff-protocol-test.json and handoff-latest-smoke-after.json. Earlier CREATE_ANYTHING_RESULTS.md and FRONTEND_INTEGRATION.md are preserved historical documents; HANDOFF.md supplies the current checkout/startup procedure.
