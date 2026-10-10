# GPU and CPU Resource Plan

Status: **PROPOSED**. Each number below is labelled with its source. "Measured" values come from
RESULTS.md, CLEAN_RECOVERY_RESULTS.md (`experiment/prompt-grounded-recovery` @ `ee6033f`) and
NATIVE720_UPDATE.md (`15644d9`). "Estimate" values must be measured in test T8 before anyone relies on them.

## 1. Current budget (measured)

| Item | Value | Source |
|---|---|---|
| GPU | RTX 4070 Ti SUPER, 16 GB | user |
| Waypoint 1.5 FP8 720p reserved during batches | 4476 MiB (allocated 3457 MiB) | RESULTS.md |
| Waypoint process peak reserved (includes init) | 8894 MiB | RESULTS.md |
| Waypoint inference per 4-frame batch | ~104–111 ms median | CLEAN_RECOVERY / NATIVE720 |
| Full batch incl. CPU JPEG encode | ~138–145 ms; JPEG encode ~32 ms/batch (CPU) | same |
| Received FPS (720p, headless/visible) | 27.6–28.7 | same |
| SDXL HIGH 1280×720, 30 steps | ~10.7–11.1 s generation; 9078 MiB peak reserved | RESULTS.md |
| Depth Anything V2 Small, CPU, 4 threads, cached | 1.71–1.81 s / image (offline, no stream contention) | RESULTS.md |
| CLIP ViT-B/32 image, CPU, 2 threads | 47.1 ms p50 / 49.1 ms p95 (offline) | CLEAN_RECOVERY |
| OWL-ViT | not proposed for this feature | — |

Process peaks are PyTorch reserved memory, not total board VRAM. The existing rule stands: **stop the world
before generating a new SDXL scene.** SDXL and Waypoint are never run concurrently by this design.

## 2. Policy: zero additional GPU work during streaming

All visual-memory models run on **CPU** in a **separate worker process**:

- **CPU, not GPU**: Waypoint saturates the GPU in back-to-back batches. Any concurrent CUDA kernel extends
  batch latency directly, and a second CUDA context costs roughly 300–500 MiB (estimate) on top of the 8.9 GB
  peak.
- **Separate process, not a thread**: model inference in the service process would hold the GIL and stall
  the asyncio loop that sends frames, processes ACKs and runs `to_thread` JPEG encoding. `asyncio.to_thread`
  does not protect against a CPU-bound PyTorch call that holds the GIL during pre- and post-processing.

GPU fallback for DINOv2-small (fp16, ~50 MiB of weights) is permitted **only** if test T8 shows CPU
contention costs more than the GPU option, measured both ways. It stays disabled by default.

## 3. Worker configuration

```
spawn method:       multiprocessing 'spawn' (Windows default)
priority:           psutil.BELOW_NORMAL_PRIORITY_CLASS
threads:            torch.set_num_threads(4); torch.set_num_interop_threads(1); OMP_NUM_THREADS=4
offline:            HF_HUB_OFFLINE=1, pinned revisions, local cache (existing launcher pattern)
models resident:    DINOv2-small (always) · Depth Anything V2 Small (lazy-loaded on first depth request)
queues:             in: multiprocessing.Queue(maxsize=8) of {oid, path, sha, world_id, epoch, tasks}
                    out: multiprocessing.Queue() of small result dicts (embedding = 768 bytes)
input:              file paths only; the worker re-reads and re-hashes the bytes and rejects on SHA mismatch
affinity (optional experiment): if the i9 has E-cores, pin the worker to E-cores and leave P-cores
                    for the service loop and JPEG encoding. Verify the CPU model first; not assumed
```

Per-task budget (estimates, to be measured in T8):

| Task | Rate | Est. cost each | Est. share of 4 worker threads |
|---|---|---|---|
| Decode + resize 224 + quality indicators + dHash | ≤1 /s | 10–20 ms | <2% |
| DINOv2-small embedding (224) | ≤1 /s | 40–100 ms (estimate; CLIP B/32 measured 47 ms at 2 threads) | ≤10% |
| Phase-correlation pan (160×90) | ≤1 /s | <2 ms | ~0 |
| Depth Anything V2 Small | **≤1 per 5 s**, keyframes only | ~1.7–1.8 s (measured offline) | ≤36% |

Depth uses a token bucket (capacity 2, refill 1 per 5 s). Requests beyond it are skipped and recorded as
`depth: skipped_budget`. Calibration views have priority.

Service-process additions per observation (estimates): SHA-256 of ~300 KB (<1 ms), JPEG draft decode
(~1–3 ms, in `to_thread`), file write and SQLite insert (~1–3 ms, in `to_thread`). Per batch inside
`Memory.batch`, only arithmetic runs.

RAM (estimates): worker RSS 1.5–2.5 GB with both models. Embedding index <1 MiB per world. Capture queue
≤4 JPEGs. This is well within 64 GB.

## 4. Backpressure and degradation order

When load rises, shed memory work in this order. **Video is never shed for memory.**

1. Skip depth requests (token bucket).
2. Analysis queue full → mark `skipped_backpressure`; the raw file is kept.
3. Capture queue full → drop the oldest *capture candidate*, counted in `dropped_queue`.
4. If event-loop lag p99 exceeds 20 ms for 10 s → automatically switch capture to sparse mode and emit
   `memory_quota{reason:'load'}`.

## 5. Acceptance gates (test T8)

Compare memory **OFF** and **ON** with the same seed and the same scripted control trace. Run ≥3 times
each, because output is stochastic. Use 60 s after warmup, one GPU world at a time, and no frontend build
running (the earlier run was contaminated by a build).

| Metric | Gate |
|---|---|
| Received FPS (genuine frames) | ON ≥ 95% of OFF mean |
| Batch latency p95 | ≤ +5 ms |
| Applied-control-to-draw p95 (browser clock) | ≤ +10 ms |
| Server drops / gaps / stale-epoch frames | No increase |
| asyncio loop lag p99 (sampled every 100 ms) | < 20 ms |
| CUDA memory allocated by the worker | 0 bytes (assert, as `analyze-checkpoint-cpu.py` already does) |
| Worker RSS | < 3 GB |
| Analysis completion | ≥ 90% of persisted observations reach `ready` within 5 s |
| Disk usage after 60 s | Reported; must match the counter |

If a gate fails, reduce cadence (interval 2 s → 4 s, depth off) before considering any GPU option.
