# Phase A0 — native720 camera turn-gain probe

**Experiment completed; NO-GO on calibrated four-direction deployment.** Human angle/quality review remains pending; no degree mapping or calibration feature was installed.

Claude's calibration workflow was read from architecture commit `d52fdc2e91450aa92b7e1b45733d2f4e29c5fc5e` before probing. Isolated experiment branch `experiment/native720-turn-gain-a0`, based on exact native720 playback commit `15644d940811509907dca1f393e0cfa2ab86ab99`. The backend implementation, accepted adapters and archive release were not modified.

## Method and provenance

Three SDXL HIGH seeds (1280×720, 30 steps): human-approved Florida hurricane street; newly generated downtown city street; newly generated underwater laboratory corridor. Only the Florida seed has user approval. Original scene metadata and hashes are in `native720-a0-scenes.json`.

21 trials: 3 scenes × magnitudes 0.5, 1, 2, 4, 8, 16, 32. Reset to the original clean seed for each trial, then exact 10 batches with mouse=(m,0), no WASD, followed by 4 zero-input batches. Four real generated frames per batch. Saved every batch's last native720 JPEG, same encoder quality85/subsampling0 as streaming. No generated anchor reused; no image enhancement. Total **1176 genuine frames**, 294 batch-last JPEGs. All JPEG hashes verified.

Precise inputs use the existing Backend.generate method in a standalone scientific process. The owned idle experimental HTTP service was stopped first; archive remained paused. This avoids conflating asynchronous WebSocket accumulation with exact per-batch mouse velocity. No production code or API changes. This is **not** a browser/session/credit benchmark; that has a separate report. The native720 model loaded once for all 21 trials, in 2.16 s. It was released when the probe process exited; the experimental service was restarted afterward.

Generation RNG was not fixed between trials, so image differences also contain stochastic generation. This limits causal comparison and degree estimation. These short tests do not establish 60-second visual stability.

## Direct GPU measurements

Zero probe errors/OOM. First cold batch: 22188.41 ms (compilation/warmup included). Remaining 293 batches: aggregate **35.40 genuine generated FPS**, median full batch 112.60 ms, median GPU inference 78.59 ms, transfer 1.34 ms, JPEG encoding 31.98 ms. These exclude HTTP/WebSocket and browser rendering and are not a substitute for interactive FPS.

Peak PyTorch reserved 8894 MiB; peak allocated 7086.89 MiB. Canvas FPS/control ACK/session epochs not measured by this offline probe. Per-trial active FPS includes its first batch; the first trial is dominated by cold compilation and must not be interpreted as steady performance.

## Inferred image-motion indicators

NumPy FFT phase correlation on consecutive 160×90 grayscale center strips, Hann window, reports horizontal pixel shift. Below is summed shift over ten turning batches at resized width160. **Pixels are not degrees.** The input API calls mouse a velocity; no measured FOV or camera pose is available. Noise, generated deformation, translation and perspective can all influence correlation.

| Scene / magnitude | 0.5 | 1 | 2 | 4 | 8 | 16 | 32 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Florida | -9.0 | -9.0 | -10.0 | -9.0 | -10.0 | -9.0 | -10.0 |
| City | -7.0 | -8.0 | -9.0 | -9.0 | -8.0 | -8.0 | -12.0 |
| Underwater | -9.0 | -8.0 | -7.0 | -8.0 | -8.0 | -8.0 | -9.0 |

The range is small and not monotonic with input magnitude. Phase correlation therefore does not support a reliable mouse-to-angle estimate here. Synthetic +5px translation only validates code sign, not model-camera calibration.

## Visual review — agent observations, not human ratings

Across the contact sheets, roads, buildings and corridor frames remain recognizable over 14 batches. Mild softness, regenerated surface detail and small perspective changes are visible; no sustained abstract collapse is apparent at these thumbnail sizes. Higher magnitudes do not clearly expose new side-facing viewpoints. Maintaining recognizable content during this very short, apparently small view change does not prove that a broad turn remains coherent.

Human angle buckets and acceptable-quality ratings are intentionally null in analysis.json. Do not populate units_per_intended_45deg using Navigation's arbitrary 0.002 radians/unit or FFT pan. No turn-and-return, heading closure or behind-view calibration was performed.

## Recommendation

**NO-GO** on a guided 0/90/270-degree survey on this evidence. First establish a visibly distinguishable camera turn with a controlled baseline (including fixed generation RNG and zero-input comparison), then human-review approximate angles before an out-and-back trial. Keep current native720 exploration/recovery available; this probe does not fix semantic drift or justify automatic spatial-memory integration. Even the proposed small-arc fallback needs evidence that its views differ; do not label an unmeasured arc as 30°.

The architecture's four_out_and_back proposal omits the behind view; it is not a measured 360-degree survey. Memory, obstacle APIs, geometry maps and control-source routes remain unactivated.

## Evidence and reproduction

- `native720-a0-probe/manifest.json`: input scenes, exact controls, timings, load count and errors.
- `native720-a0-probe/scene-<n>-m<m>/batches.jsonl`: applied controls, JPEG hash, timing and allocator memory.
- `native720-a0-probe/scene-<n>-m<m>/seed.png`, `batch-01.jpg` through `batch-14.jpg`.
- `native720-a0-probe/scene-1-probe-sheet.jpg`, `scene-2-probe-sheet.jpg`, `scene-3-probe-sheet.jpg`.
- `native720-a0-probe/analysis.json`: inferred pan/change/sharpness statistics; human approval pending.

From the isolated checkout, stop only the owned idle8002 process and keep archive8000 paused, then run:

```powershell
$env:HF_HUB_OFFLINE='1'
& 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe' .\experiments\a0\probe_native720_a0.py --backend .\experiments\backend --scenes ..\..\outputs\native720-a0-scenes.json --out ..\..\outputs\native720-a0-probe-repeat
& 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe' .\experiments\a0\analyze_native720_a0.py --root ..\..\outputs\native720-a0-probe-repeat
powershell -ExecutionPolicy Bypass -File .\experiments\Start-RecoveryEvaluation.ps1
```

Output folder must be new. Guard aborts if8002 is reachable or archive8000 is generating. No merge. Frozen-file hash verification: zero mismatches.

Review clip: native720-a0-probe/a0-m32-sampled-review.mp4 shows three magnitude-32 trials side by side at one saved batch-last image per second. This is a deliberately slowed sampled review, not live playback or a full-frame-rate recording; its playback rate is not genuine generated FPS. Each pane retains native1280x720 source resolution.

