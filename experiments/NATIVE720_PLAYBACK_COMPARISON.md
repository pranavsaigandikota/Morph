# Native 720p playback comparison — 2026-10-10

**Result: INCONCLUSIVE for presenter improvement. Transport/lifecycle passed in these runs.**

Exact tested checkout: `15644d940811509907dca1f393e0cfa2ab86ab99`, branch `experiment/prompt-grounded-recovery`, URL `http://127.0.0.1:4835/quality-recovery.html`. No code changes during the comparison. Native 1280×720 Waypoint `Overworld/Waypoint-1.5-1B`, FP8 `fp8w8a8`; genuine decoded frames only. Archived production service remained paused; no concurrent world inference.

Brave was explicitly confirmed foreground by the user. Page telemetry nevertheless recorded animation callbacks at approximately one-second intervals (p95 around 1017 ms), while all visibility/focus samples said visible/focused. The underlying cause is not established. These conditions invalidate an inference about normal foreground canvas performance. Do not describe the queue as faster on this evidence or use these canvas numbers as its normal performance.

The first two 60-second cases isolate latest-frame selection versus FIFO depth 4, 30-Hz scheduling, 140-ms stale limit, with identical original SDXL seed and mixed control trajectory. This controlled harness uses createImageBitmap for both presenters; it is not a literal replay of the older React HTMLImageElement implementation. Last two cases are extra recovery diagnostics, not the controlled presenter A/B.

SDXL HIGH seed: scene `9bda60c5d71a411680f71969c487684d`, RNG seed 20261011, 1280×720, 30 steps, CFG 5. Same initial image for every case, SHA256 `8b4d373fb652ca1c8fb81f0791c81916ced00caff76907743ca9d46ba2ee02f3`. Florida hurricane street theme. Repeating controls at 20 Hz: W 6 s; A+dx0.5 2 s; S 2 s; D+dy0.15 2 s. Input is zeroed during restoration. Fixed restoration every 15 s; risk policy uses movement/rotation/cooldown budgets, not semantic quality assessment.

## Direct measurements

Generated FPS is the server's real-frame counter divided by its session elapsed time; received/canvas FPS use the client's measured 60-second window after first draw. The small differences reflect counter/window boundaries. Presentation skips are deliberate client omissions, separate from true server drops. None are interpolated frames.

| Case | Seconds | Generated FPS | Received FPS | Canvas FPS | Presentation skips | Server drops | Frame gaps | Decode/protocol errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| latest-original-fixed | 60.05 | 29.09 | 29.13 | 0.98 | 1687 | 0 | 0 | 0/0 |
| paced-original-fixed | 60.01 | 29.10 | 29.08 | 0.98 | 1674 | 0 | 0 | 0/0 |
| paced-fresh-fixed | 60.06 | 29.10 | 29.12 | 0.93 | 1680 | 0 | 0 | 0/0 |
| paced-fresh-risk | 60.02 | 30.42 | 30.47 | 0.98 | 1741 | 0 | 0 | 0/0 |

| Case | Receipt-to-canvas age p50/p95 ms | Decode p50/p95 ms | Control-to-canvas p50/p95 ms | Input ACK p50/p95 ms | rAF p95 ms |
|---|---:|---:|---:|---:|---:|
| latest-original-fixed | 80.2/131.11 | 5.95/19.62 | 253.6/315.16 | 1.8/16.3 | 1016.7 |
| paced-original-fixed | 85.65/147.51 | 6.25/28.05 | 249.2/338.75 | 2.1/18.94 | 1016.8 |
| paced-fresh-fixed | 78.3/142.92 | 5.9/18.88 | 242.95/309.38 | 2.0/17.44 | 1016.7 |
| paced-fresh-risk | 76.15/135.44 | 5.25/19.31 | 238.2/309.88 | 1.9/17.12 | 1016.71 |

Age means client receipt-to-draw, not unsynchronized server-to-client clock subtraction. Staleness is checked before decoding, so draw age can exceed 140 ms by decoding/scheduling time. Input ACK is client monotonic round trip using echoed elapsed timestamp. Control-to-canvas is client elapsed time between sent sequence and drawing a frame tagged with that sequence; it is a proxy, not proof of visible pixel response. In this throttled run latency samples are sparse. Server and client absolute clocks are never subtracted.

All four cases: zero reported failures, stale-epoch arrivals, server drops, frame gaps, decode errors and protocol errors. Model load count stayed 1. PyTorch reserved 4476 MiB, peak reserved 8894 MiB, peak allocated 7086.89 MiB. One NVML snapshot during inference: total GPU memory 9535 MiB, utilization 64%, 226.69 W, 69°C; this is a snapshot, not a time-series peak. Total NVML includes the paused archival model and differs from process allocator memory.

## Credits and lifecycle

- `native720-latest-original-fixed-1791663486988`: 3 restores, epochs [6, 7, 8], one session/world throughout restoration; server acknowledges 1752 of 1752 generated frames; first post-restore received frame 303–358 ms, first canvas draw 1226–1294 ms.
- `native720-paced-original-fixed-1791663547729`: 3 restores, epochs [10, 11, 12], one session/world throughout restoration; server acknowledges 1768 of 1768 generated frames; first post-restore received frame 327–340 ms, first canvas draw 1058–1117 ms.
- `native720-paced-fresh-fixed-1791663608778`: 3 restores, epochs [14, 15, 16], one session/world throughout restoration; server acknowledges 1764 of 1764 generated frames; first post-restore received frame 258–367 ms, first canvas draw 1042–1097 ms.
- `native720-paced-fresh-risk-1791663669663`: 7 restores, epochs [18, 19, 20, 21, 22, 23, 24], one session/world throughout restoration; server acknowledges 1840 of 1840 generated frames; first post-restore received frame 279–385 ms, first canvas draw 307–1099 ms.

Every received binary message is acknowledged, including deliberately skipped presentation frames. Each run starts one session and stops before the next. Epoch changes clear the old display queue; no stale draws or stuck-control errors were reported. Receipt minus draws minus skips can include epoch flushes and final queued/inflight frames; it is not a server-drop count. These were checkpoint restores using the supported lifecycle; this run did not separately exercise reconnect or POST /world/reset.

## Reproduction and evidence

From the isolated checkout, run `powershell -ExecutionPolicy Bypass -File .\experiments\Start-RecoveryEvaluation.ps1` (or `-Restart` only for the owned idle experiment). Keep the archive paused. Bring Brave to the URL above and click **Run four 60-second cases**. No browser settings were changed in this experiment.

Raw reports, genuine sampled JPEGs, canvas PNGs at 0/15/30/45/end and transition times: `native720-presentation/<run-id>/`. Machine summary: `native720-playback-summary.json`; completed browser screenshot: `native720-playback/brave-completed.png`. The earlier partial run `1791660604390` is excluded. No video was captured at real canvas cadence; JPEG samples are about 5 Hz and must not be described as full-frame-rate recordings.

Recommendation: retain the isolated queue for further testing, but **NO-GO on a playback-improvement claim** until scheduling is normal. This run verifies genuine native720 transport and repeated supported restoration, not continuous visual coherence. Phase A0 has a separate report. No merge or production backend change.
