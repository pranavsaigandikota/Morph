# Native 720p product direction and presentation experiment

Native 1280×720 Waypoint FP8 and SDXL HIGH are the only supported visual configuration in the isolated branch. Lower-resolution selection/fallback is removed. The old port8000 implementation and release6423304 remain untouched archives. No change has been merged or pushed to main.

The user's preferred bottom-right pane was **720p original-seed restoration**, not fresh-seed recovery. Both remain experimental reference strategies. The accepted fresh-SDXL baseline remains 28.73 genuine generated FPS, 8.33 canvas FPS, three recovery cycles, 230–328ms to new canvas frames and zero reported server drops/gaps/decode errors. That earlier run is not reclassified as continuously coherent.

## Implemented changes

- Native-only model guard and frontend health check; default endpoint8002. Unsupported model endpoints fail explicitly.
- Preserve four genuine JPEG frames from each burst in a bounded FIFO queue; cap4 frames, up-to30FPS canvas cadence, maximum140ms queue age. Overflow/stale frames count as presentation skips, not server drops. No synthesized/interpolated frames.
- Preserve existing input, frame credits, session IDs and epoch checks. Existing WebSocket acknowledgment point is unchanged.
- Native-only comparison harness with latest-frame versus paced presentation, original/fresh restoration, manual Refresh World and an optional risk-budget case.
- Risk-budget recovery uses moving-frame exposure, cumulative camera input and a maximum segment duration, with an8-second minimum cooldown. These are conservative experimental risk indicators, **not image understanding or a proven quality detector**. They are not activated automatically in the React product.
- Fresh anchors are cached SDXL images with the same original prompt. No degraded Waypoint frames are used. Arbitrary-theme generation remains supported by the general memory_service app; the recovery_experiment app preloads only the approved Florida test manifest.

## Actual results so far

The new live native720 baseline attempt was stopped at48.93seconds because of unreliable browser scheduling. It received29.29 real frames/s and drew1.82 canvas frames/s, with zero reported stream errors, server drops, gaps or decode errors and three restores. These are **diagnostic measurements from an interrupted run, not a new accepted performance baseline**.

The rAF callback interval averaged224.6ms and reached1016.8ms, even though document visibility/focus flags reported visible/true. Four-frame delivery bursts and host/browser throttling both require attention. Bitmap decoding alone cannot explain those scheduling stalls. The browser visibility capability was enabled; a physical foreground confirmation is pending before the fair comparison restarts.

Reserved PyTorch memory4476MiB; process peak8894MiB. These are not total board VRAM readings. Model load count1. Median inference103.99ms/four-frame batch and full batch138.48ms. Aggregate /metrics FPS includes cold warmup and must not be confused with the post-warmup received rate above.

**No GPU-measured FPS gain from the revised presenter is claimed yet. No claim of continuous visual coherence is made.** The scheduled four full60-second comparisons are still pending foreground validation.

Build passed with the existing large-bundle warning. Presenter tests passed for four-frame burst order,140ms stale-frame cutoff, epoch invalidation and empty-queue/no-invented-frame behavior. Four memory/schema tests passed. Rescue Play/A* and recorded AI Showdown validation passed; no simulator/model/data changes. The browser-key runner could not complete against its configured test service; no new physical keyboard validation is claimed. Frozen production file hashes still match, zero changes.

## Startup

```powershell
Set-Location 'C:\Users\filma\Documents\Codex\2026-10-10\wo\work\native720-quality'
# General native720 React + SDXL HIGH + Waypoint + checkpoint service:
.\experiments\Start-Native720.ps1 -Restart
# Wait for http://127.0.0.1:8002/health: ready, model Overworld/Waypoint-1.5-1B
# Open http://127.0.0.1:4834/create

# Separate experimental comparison (never concurrently with another world):
.\experiments\Start-RecoveryEvaluation.ps1 -Restart
# Open http://127.0.0.1:4835/quality-recovery.html and keep foregrounded.
# Click Run four 60-second cases.

node_modules/.bin/tsx.cmd scripts/verify-native720-presentation.ts
npm run build
```

Restart refuses active worlds, unknown listeners and processes not owned by these launchers. Neither launcher targets archival8000. The generic React launcher does not enable the experimental risk budget or unrelated cached recovery scenes. Use saved SDXL scenes and existing reset/checkpoint restoration as fallback. Host/browser background throttling may severely reduce canvas draws despite successful inference. Pointer-lock reliability and visual drift remain limitations.

Raw interrupted-run evidence: `native720-presentation/native720-latest-original-fixed-1791660604390/report.json`. The updated comparison is isolated and unpromoted; complete foreground playback and visual-review gates before adoption.
