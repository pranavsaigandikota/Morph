# Native720 memory and optional obstacle prototype — 2026-10-10

Implemented in isolation: native Waypoint1.5 1280x720FP8; real SDXLBase30step first-person generation; bounded raw checkpoint storage, original user scene context, SHA256 provenance, estimated navigation/trajectory, manual review and raw-anchor restoration. Production8000 and frozen6423304 preserved (hash manifest:0 mismatches). No new frontend map UI, no Rescue/PPO changes. Enhancement, FAST selector within this service and online obstacle API are unfinished; they are explicitly marked planned/proposed in contract.

Real SDXLBase Florida seed20261010:14.823s total,11.066s generation; image peak reserved9078MiB. Generated directly1280x720, not an upscaled360P frame. Waypoint720 offline feasibility33.264FPS is a separate earlier test, not interactive FPS.

Final HTTP validation of explicit `quality:"high"`,30steps,seed20261010 and a shorter hurricane prompt produced a second real1280x720 image:13.780s total,10.669s generation,9078MiB process peak reserved, job1713cc4726a94d979c3285570ef02530 ready with no error. Its image is outputs/world-memory/fresh-high-seed.png. This second seed was not the image used in the60s comparison. Four focused unit tests and frontend build passed; build retained the existing large-bundle warning.

## GPU checkpoint lifecycle

Repeated protocol test60.2406s after first-frame warmup:28.50 receivedFPS; five manual saves plus periodic candidates; paused navigation held; invalid-checkpoint preflight404 left epoch unchanged; three raw restorations retained session/world IDs and advanced epochs; Reset restored original estimated pose; reconnect and stop/start world isolation passed. Restore initialize times164.72,181.32,182.66ms (does not include time to next browser paint). Zero stale-epoch frames, zero envelope errors, zero client-reported errors;1 frame gap and3 backend-counted drops. Existing drop counter includes lifecycle queue flushes, so do not report these as pure transport loss. Headless test has no canvas FPS; raw JPEG sample files were Pillow-decoded successfully.

First attempt is retained:23.62 receivedFPS,1 gap,75 counted drops and server WebSocket timeout trace around reconnect. Python3.10 asyncio.TimeoutError differs from builtinTimeoutError; isolated service catch corrected. Retest had no uncaught timeout trace. Accepted production exception handling was not rewritten. Treat lifecycle continuity as tested, not a claim of zero lifecycle discarded frames.

## Actual visible browser test, no recovery

Isolated harness native720-sdxl30-mixed-1791658178027;60.0429s, visible browser, identical Florida seed.1672 backend-log generated frames including shutdown boundary (27.8468FPS);1665 received (27.7302FPS),460 genuine canvas draws (7.6612FPS).1204 deliberate presentation skips; one frame at capture boundary accounts for received-minus-displayed-minus-skips. No interpolation. Observed server drops0, frame gaps0, decode errors0, protocol errors0. ACK RTT p50/p95:1.0/6.495ms. Control-to-draw p50/p95:186.4/212.1ms measured on browser clock. Batch latency p50/p95:145.52/149.67ms. Batch VRAM reserved4476MiB, allocated3457.48MiB; process peak8894MiB includes initialization. Model load count1 during each server run. Native720 is slower than accepted360P71+FPS; this is an intentional separate profile, not a regression rewrite of stable360P.

Evidence: outputs/native720/native720-sdxl30-mixed-1791658178027/report.json, canvas-00/15/30/45/end.png, analysis/contact-sheet.png, analysis/summary.json, analysis/*-5hz-sampled.mp4. Video contains real sampled JPEGs (approximately5Hz target, actual209 samples) held across recorded timestamps; video frame rate is not generated FPS. Node checkpoint report: outputs/world-memory/gpu-checkpoint-report.json; earlier attempt: gpu-checkpoint-report-first.json. First-run individual JPG names were reused by the retest; only its JSON and pre-retake contact sheet should be treated as first-run evidence. Test runner now uses unique run directories to prevent repetition collisions.

## Visual assessment — agent review, not human ratings

Early Florida samples retain recognizable houses, roadway and trees. By30s mixed movement the viewpoint becomes dominated by distorted vegetation;45-60s shows smeared surfaces and increasingly unnatural cloud shapes. The five manual-save contact sheet also shows later captures tilting toward ambiguous ground. Native resolution does not fix drift. Periodic captures are unapproved candidates, not guaranteed last-good frames. Reset/re-anchor creates a new supported segment; no exact previous geometry, collision or geographically connected return claim. Human visual review and Cursor map integration remain pending.

## Optional raw-evidence obstacle analysis

API status: PROPOSED, not activated, awaiting Cursor schema review. Standalone CPU prototype analyzed the raw initial checkpoint and a late raw video checkpoint after live tests finished. Enhanced images were not used. Model parameters forcedCPU;4 compute threads; process CUDA allocation0 bytes. DepthAnythingV2Small revision5426e4f0f36572d16453bbda7a8389317b1bef99; OWL-ViTBasePatch32 revisioncbc355fb364588351c5d51c7f74465e8e7ec6f72. Cached timings1.807s initial,1.714s late; first download/load run11.741s. These timings exclude Python imports/startup and are not an online stream-contention benchmark.

Initial screenshot produced9 boxes:8 fallen-tree candidates,1 building, scores0.12-0.264 at deliberately permissive0.12 threshold. Duplicates and weak matches expose false-positive risk; no reliable hazard/path detection claim. Degraded late checkpoint produced0 boxes; absence does not imply safety or a clear path. Relative depth is within-image rank, not meters or comparable global distance. Observations associate with estimated checkpoint camera pose; obstacle world position and calibrated bearing remain null. Raw SHA256 and checkpoint ID are preserved. Human detector/depth accuracy review, deduplication, broader theme tests and live CPU contention tests are still required before activation.

Outputs: world-memory/obstacle-cpu/{observations.json,relative-depth.png,relative-depth.npy}; obstacle-degraded-cpu/ equivalent. No new large model is loaded on Waypoint's GPU. Proposal published for Cursor on the same branch; Cursor agreement has not been received. No API schema fields changed for obstacles.

## Recommendation

GO for Cursor integration of basic checkpoint/estimated-navigation/raw-restore backend in an isolated demo. NO-GO for claiming sustained coherent60s visuals, accurate obstacle geometry, autonomous pathfinding through video, enhancement repair or complete frontend memory integration. Keep6423304 as judging fallback. Use a visually reviewed initial/early checkpoint for explicit restoration; never silently select a degraded latest frame or label an AI-inferred obstacle as a verified physical object.

## World Memory API v1.1 GPU smoke (branch `claude/live-memory-backend`, 2026-10-10)

Real native 1280×720 Waypoint on :8002 (`Start-LiveMemoryBackend.ps1`), human-approved Florida SDXL HIGH
seed `9bda60c5d71a411680f71969c487684d`, headless Node client `experiments/smoke-live-memory.mjs` acknowledging
every frame. One world, ~36 s, 205 received frames. **19/19 checks passed**: v1.1 capabilities; 1280×720
frames; two guided-calibration captures (`capture_reason:'calibration'`, soft labels `forward`/`right`) saved
unapproved; invalid calibration requests rejected 422; served raw bytes match `image_sha256`; light
navigation read and incremental read; review with reviewer/reason; unreviewed calibration capture refused
restore (409); approved restore → epoch 2, `anchor_kind:'checkpoint_restore'`, `restored_from_checkpoint_id`
set, new segment (recovery 180.4 ms server-side); reset → epoch 3, `anchor_kind:'reset_to_seed'`; 18 memory
events, zero stale-epoch; zero stream errors. World stopped cleanly; model load count 1; archived :8000 untouched.

Limits: smoke, not a benchmark. The 31.3 received-FPS figure spans restore/reset pauses in a headless
client and is not comparable to browser canvas FPS. The nominal yaw after the "right" turn (0.272 rad) is
diagnostic only. A0 established no mouse-to-angle mapping, so it is not an angle. Report:
`experiments/backend/results/smoke-live-memory-1791666519571.json` (local, gitignored).
