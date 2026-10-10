# Minimal browser scheduling diagnosis — 2026-10-10

**Finding:** approximately one-second animation scheduling gaps reproduce without Waypoint or React, and in the actual React Explorer under browser automation. **Root cause is not established for a regular manually operated Brave window.** No queue optimization or backend changes follow from this result. A human-operated30-second page is provided.

## Automated condition measurements

Brave/Chromium155 through the existing browser extension session, same PC, native720 sources. These are explicitly automation-controlled results, not independent regular-window results. Every retained visibility/focus sample said visible/focused; no long tasks were recorded in these runs. Browser power-saving settings were not read or changed; these settings are not reliably exposed to the web page.

| 30-second condition | rAF callbacks/sec | rAF interval p95 ms | JPEG latency p50/p95 ms | drawImage p50/p95 ms |
|---|---:|---:|---:|---:|
| Standalone, rAF only, no streaming/image work | 8.43 | 1016.6 | — | — |
| Standalone cached JPEG decode only | 8.90 | 1016.5 | 5.6 / 9.4 | — |
| Standalone predecoded canvas drawing only | 1.10 | 1016.8 | predecoded before timing | 0 / 0.1 |
| Actual React Explorer, warmed real GPU stream | 1.17 | 1016.7 | 1.9 / 5.2 | 0 / 0.1 |

The first two standalone tests included brief faster scheduling (median16.7ms), followed by long scheduling gaps; their overall rate is not a steady8–9Hz mode. Pure drawing maximum0.3ms; Explorer draw maximum0.4ms. No claim that draw submission measures compositor/GPU completion. Standalone createImageBitmap and Explorer HTMLImageElement src-to-load are different pathways; their latency is not directly comparable as decoderCPU time.

Warmed Explorer:30.004s,27.20 genuine generated FPS from server real-frame counter delta / server elapsed delta;27.33 received FPS;1.07 canvas FPS;788 intentional presentation skips. Zero server drops, decode errors and protocol errors. Same session and epoch throughout measurement. Server acknowledges1180/1180 generated frames in final snapshot. PyTorch reserved4476MiB, peak8894MiB. Input was stationary; no new control responsiveness claim. The first attempted Explorer interval included cold initialization and is excluded (`automated-explorer-warmup-excluded.json`). The warmed interval starts with376 received frames and server counter364; counter sample boundaries differ slightly.

## What the evidence supports

Streaming, GPU inference and React are not required to reproduce long scheduling intervals in this controlled browser session. Small measured image/draw times and absent recorded long tasks do not explain the approximately one-second gaps. The cause could still involve automation window handling, actual compositor scheduling, extensions or power-saving behavior; none is isolated by these measurements. Visibility/focus booleans alone do not establish normal foreground rendering.

**Next required evidence:** run the same page yourself in a new normal Brave window, without agent control or DevTools, then the actual Explorer. Use [HUMAN_BROWSER_DIAGNOSIS.md](HUMAN_BROWSER_DIAGNOSIS.md). Inspect installed Brave power-saving/graphics settings and Windows power mode manually, record actual states, and leave them unchanged for the first comparison. No100%GPU utilization target, no invented frames and no presenter modifications.

## Manual look-and-capture prototype smoke test

The research direction now uses natural user look movement and explicit captures, not exact-degree turns. Raw checkpoint metadata remains authoritative. Exported sidecar includes relative label, unscaled DOM mouse observations, checkpoint/world/session/epoch/frame/control IDs and uncertainty; `angle_degrees:null`. No API schema extension, obstacle/map integration, enhanced anchor or automatic camera controller.

One integration problem was found in the first prototype: an external HTTP resume restarted backend generation but did not update the accepted React adapter's local paused phase. The isolated overlay now uses the existing React Resume control after review. The adapter and backend were not edited.

Corrected GPU smoke test:

- Session `8f0ebe90af72498e9297882c82c8241d`, original seed previously human-approved; explicit seed review flag stored through existing review endpoint.
- Saved genuine raw checkpoint `1fff7330cd9946fd8b74485a01ea0f69`, frame612, epoch3, SHA256 `7931624e7a57868b913d9c6dacff19f60460a274cd369e8cf8c552a7d8812bcb`.
- Agent rejected this generated checkpoint; it is not a human-approved anchor. Corrected Resume returned frontend phase to streaming in the same session.
- Finish survey called existing POST/world/reset; original seed restored, epoch advanced3→4, same session. No new world was created by reset. Post-reset playback was not separately timed in this smoke test. Session then stopped; experimental service ready, archive paused.

This is a lifecycle smoke test, not a completed human look-around survey or evidence that new side views are coherent. Angle calibration remains NO-GO. Orientation and spatial relationship uncertainty remain unbounded. The existing backend's periodic checkpoints are separate, unapproved candidates. Two older completed experimental memory folders were archived intact under `work/native720-memory-archive` to preserve captures and free the experimental folder quota; no production data was touched.

## Evidence, isolation and checks

Local automation UI summaries: `automated-raf-only.json`, `automated-jpeg-decode.json`, `automated-canvas-draw.json`, `automated-explorer-scheduling.json`. These summaries omit raw timing arrays and retain the final3 visibility samples; the human Download button exports full arrays and samples. Raw checkpoint smoke-test snapshot: `manual-capture-corrected-test.json`. Screenshots: `scheduling-test.png`, `manual-capture-reset.png`.

Frontend build PASS (existing bundle-size warning). JavaScript syntax PASS. Existing native720 queue ordering/staleness/epoch tests PASS. Frozen-file hash verification: zero mismatches. Git diff against15644d9 shows no changes to `src` or `experiments/backend`. Opt-in diagnostics are loaded only for explicit flags; normal routes receive no instrumentation. Timing wrappers restore themselves after30seconds. Backend, queue, credits, archived release, RescueGame and AI Showdown unchanged. No merge.
