# Visual Spatial Memory and Calibration: Architecture

Status: **PROPOSED** (design only, not implemented). Written 2026-10-10 against branch
`feature/worldshift-spatial-memory-backend` @ `ad71609`. It extends that branch's isolated native720
service (port 8002). Production 8000 and release `6423304` are untouched.

Companion documents in this folder:

| Document | Purpose |
|---|---|
| [CALIBRATION_WORKFLOW.md](CALIBRATION_WORKFLOW.md) | Guided look-around after SDXL start (Feature 1) |
| [MEMORY_DATA_MODEL.md](MEMORY_DATA_MODEL.md) | Observation store, storage budget, capture/dedup (Features 2, 3) |
| [LOCALIZATION_ALGORITHM.md](LOCALIZATION_ALGORITHM.md) | Dead reckoning, place recognition, sequence matching, hypotheses (Feature 4) |
| [CURSOR_FRONTEND_CONTRACT.md](CURSOR_FRONTEND_CONTRACT.md) | REST and event contract for the live map (Feature 5) |
| [GPU_RESOURCE_PLAN.md](GPU_RESOURCE_PLAN.md) | VRAM/CPU budget, scheduling, isolation from Waypoint |
| [MVP_IMPLEMENTATION_PLAN.md](MVP_IMPLEMENTATION_PLAN.md) | Phases A–E, reuse map, tests, human review |
| [LIMITATIONS_AND_RISKS.md](LIMITATIONS_AND_RISKS.md) | Technical limitations and risks |

---

## 1. Product goal, stated precisely

WorldShift should **remember what the player saw and roughly where they were heading when they saw it**.
It should be able to show that memory on a map and use it to pick a good recovery anchor.

It is **not** SLAM. Waypoint 1.5 is an autoregressive video model conditioned on frames and controls. It
keeps no persistent 3D scene, so there is no ground-truth geometry to localize against. Every position on
the map is a *control-history estimate* in arbitrary units. Every "you've been here before" is a
*visual-similarity hypothesis* about generated imagery.

## 2. Evidence classes (the core rule of this design)

Every field the system stores or shows belongs to exactly one class. The class travels with the data
through the API (`evidence` tag, see the frontend contract) and is shown in the UI.

| Class | Meaning | Examples in WorldShift | Can be wrong because… |
|---|---|---|---|
| **MEASURED** | Directly observed by the service, reproducible from logs | JPEG bytes streamed to the client, their SHA-256, `frame_id`, `epoch`, `session_id`, applied `keys`/`mouse` per batch (`batches.jsonl`), timestamps, inference ms, VRAM reserved, image dimensions, pixel statistics | Only via bugs. Note: "raw" means the **q85 JPEG the service encoded**, not the model's float tensor |
| **ESTIMATED** (from controls) | Dead reckoning from applied inputs and nominal constants | `x`, `z`, `yaw`, `pitch`, cumulative movement, uncertainty radius | Waypoint does not obey the constants. `0.002 rad/mouse-unit` and `1 unit/s` are **arbitrary**, chosen by us |
| **INFERRED** (from generated imagery) | Model outputs over generated frames | Embedding similarity, revisit candidates, relative-depth rank, quality indicators, image-space pan (phase correlation), detector boxes | Generated imagery is self-similar by theme. A different "place" can look the same, and the same "place" may be regenerated differently |
| **REVIEWED** | A human looked and judged | `approved`, `same_place` labels, calibration accept/reject | Human error, but this is our best ground truth |
| **UNKNOWABLE** (with current system) | No signal exists to establish it | Metric distance, true camera FOV, true yaw angle, whether two frames depict "the same physical place", collision/traversability, persistence of off-screen content | — |
| **MOCK** | Fixture data for UI development | Any example payload | Must never be shown without a visible MOCK badge |

Rules that follow from this table:

1. An INFERRED signal never overwrites an ESTIMATED value silently. Visual revisit matches create **links**
   with confidence. They do not move the player marker (see LOCALIZATION_ALGORITHM.md §6).
2. ESTIMATED positions are never labelled in metres, feet or "m". Units are `estimated_units`.
3. Headings in calibration are **intended** headings (`intended_yaw_deg`), not measured camera angles.
4. Raw evidence (JPEG bytes and SHA-256) is immutable once persisted. Thumbnails and embeddings are
   derived artefacts that carry the source SHA-256.

## 3. What exists today vs. what this design adds

Verified by reading `experiments/backend/worldshift/{memory.py,memory_service.py,service.py,backend.py}`
on the backend branch:

| Capability | Status | Location |
|---|---|---|
| Native 1280×720 Waypoint FP8, 4-frame batches, ~28 received FPS | IMPLEMENTED, GPU-tested | `backend.py`, RESULTS.md |
| SDXL HIGH 1280×720 scene generation (30 steps) | IMPLEMENTED, GPU-tested | `scene_service.py` |
| Per-batch applied control capture (`keys`, accumulated `mouse`) | IMPLEMENTED | `service.py` `run()`, `batches.jsonl` |
| Dead-reckoning `Navigation` (x, z, yaw, pitch, linear confidence decay, segment_id) | IMPLEMENTED (arbitrary constants) | `memory.py` `Navigation` |
| Raw checkpoint save (≤32/world), SHA-256, initial seed = checkpoint 0 | IMPLEMENTED | `memory.py` `Memory.save` |
| Periodic candidate capture (10 s, or >0.7 rad nominal turn after 5 s) | IMPLEMENTED | `memory.py` `Memory.batch` |
| Weak quality indicators (luma std, Laplacian variance; rejects uniform frames) | IMPLEMENTED (not a coherence detector) | `memory.py` `inspect_image` |
| Human review flag, raw restore via `reset + append_frame`, new epoch and segment | IMPLEMENTED, GPU-tested | `memory.py` `review/restore/reposition` |
| JSON memory events on the WS, non-credit-consuming, best-effort | IMPLEMENTED | `memory.py` `emit` |
| Bounded storage: 8 worlds, 256 MiB, 2048 trajectory points | IMPLEMENTED | `memory.py` |
| Depth Anything V2 Small + OWL-ViT offline CPU analysis of a checkpoint | EXPERIMENTAL script, not in API | `analyze-checkpoint-cpu.py` |
| CLIP ViT-B/32 CPU semantic diagnostic | EXPERIMENTAL, **failed** to separate approved vs rejected | `experiment/prompt-grounded-recovery` |
| Cursor live memory map UI | **NOT FOUND**. The branch `feature/worldshift-visual-memory-ui` is absent locally and in the last-fetched remote refs (fetch failed with an SSL error). The only map component in `src/` is Rescue's `MapLegend.tsx` (grid legend, unrelated) | — |
| Guided calibration | PROPOSED (this design) | — |
| Observation store (many lightweight frames, separate from 32 checkpoints) | PROPOSED | — |
| Embeddings, place recognition, sequence matching, hypotheses | PROPOSED | — |
| Uncertainty radius (replacing linear `confidence`) | PROPOSED | — |
| Degradation detection and anchor suggestion | PROPOSED | — |

## 4. Component architecture

```
                     ┌──────────────────────── service process (asyncio, port 8002) ───────────────────────┐
 Browser             │                                                                                     │
 (controller) ──WS──►│ receiver ─► s.keys/s.mouse ─┐                                                       │
                     │                             ▼                                                       │
                     │  CalibrationController ──► ControlSource ──► run() loop ──► backend.generate (GPU)  │
                     │  (PROPOSED, overrides input  (PROPOSED seam)        │                               │
                     │   during calibration only)                         ▼                               │
                     │                                           encode JPEG ×4 ──► subscribers (WS)      │
                     │                                                    │                               │
                     │                                    Memory.batch(jpeg[-1], meta, keys, mouse)       │
                     │                                    (EXISTING hook, O(1), no decode)                │
                     │                                            │                                       │
                     │              ┌─────────────────────────────┼───────────────────────────┐           │
                     │              ▼                             ▼                           ▼           │
                     │      Navigation.apply           CaptureTrigger (PROPOSED)    checkpoint trigger    │
                     │      (+ uncertainty, PROPOSED)  time/turn/translate/settle   (EXISTING)            │
                     │                                         │ put_nowait                               │
                     │                                         ▼                                          │
                     │                           bounded asyncio.Queue(maxsize=4)                         │
                     │                           drop-oldest, counted                                     │
                     │                                         │                                          │
                     │                     ObservationWriter task: sha256 + write raw JPEG                │
                     │                     + SQLite row (status=pending_analysis)                         │
                     │                                         │ path + id                                │
                     └─────────────────────────────────────────┼──────────────────────────────────────────┘
                                                               ▼  multiprocessing.Queue(maxsize=8)
                     ┌──────────── analysis worker process (CPU only, BELOW_NORMAL priority, 4 threads) ───┐
                     │ decode → 224px → quality indicators, dHash, DINOv2-small embedding                │
                     │ (optional, sparse) Depth Anything V2 Small layout grid                            │
                     └──────────────────────────────┬─────────────────────────────────────────────────────┘
                                                    ▼ results queue
                     ┌──────────────── service process ───────────────────────────────────────────────────┐
                     │ MemoryIndex (numpy matrix per world) ─► Localizer: retrieval → sequence matching   │
                     │   → hypothesis {continuing, new_area, possible_revisit, unknown_after_restore}     │
                     │ DegradationMonitor (PROPOSED) ─► anchor suggestions                                │
                     │ emit(observation_added | localization_update | revisit_candidate | …)              │
                     └────────────────────────────────────────────────────────────────────────────────────┘
```

Design invariants:

- **The generation loop never waits on memory.** `Memory.batch` stays O(1). It does no decode, no hash
  and no file I/O inline. It does pose arithmetic and a `put_nowait`. A full queue drops a *memory*
  sample, never a video frame or credit.
- **No vision model on the GPU by default.** Waypoint 720p already spends ~104–111 ms GPU time per batch,
  and CPU JPEG encoding at 720p takes ~32 ms per batch (CLEAN_RECOVERY_RESULTS.md). The analysis worker
  runs in a **separate OS process** so model inference cannot hold the service's GIL and stall the asyncio
  loop that sends frames. See GPU_RESOURCE_PLAN.md.
- **Everything is per world and per session.** Indexes are keyed by `world_id`. Matching across worlds
  is disabled. Old-epoch results are dropped on arrival.
- **REST is authoritative and events are hints.** This matches the existing contract.

## 5. Recovery and memory (Feature 6)

What the evidence supports today (CLEAN_RECOVERY_RESULTS.md and NATIVE720_UPDATE.md):

- Restoring a clean SDXL anchor visibly resets drift. Drift then returns within roughly 15 s of mixed
  movement.
- Nothing has shown that memory makes Waypoint generate better frames. The memory system's realistic job
  is better **decisions**: *when* to suggest recovery, *which* anchor, and *how to record* the
  discontinuity honestly.
- The user preferred **720p original-seed restoration** in the presentation experiment.
- A CLIP structure-vs-blob score accepted a human-rejected frame, so no learned score may gate approval.

Proposed recovery flow:

1. **DegradationMonitor** (INFERRED, advisory). It watches a sliding window (default 6 s) of analysed
   observations and flags `degradation_suspected` when **sustained** evidence agrees:
   - `semantic_drift`: max cosine similarity to the world's *approved* reference set (seed plus accepted
     calibration views) falls below a per-world threshold derived from calibration (§ LOCALIZATION 5.3).
   - `indicator_drop`: Laplacian variance or luma std falls below the world's calibration baseline × k.
   - `exposure`: the existing risk-budget idea from NATIVE720_UPDATE (moving-frame exposure, cumulative
     camera input, segment age). This is a **risk indicator**, not image understanding.

   Hysteresis requires ≥2 of the 3 signals for ≥N consecutive observations, plus an 8 s cooldown after any
   restore. Output is a suggestion, never an automatic certification.
2. **Anchor selection** ranks only `approved == true` checkpoints (human-reviewed, or the seed):

   `score = w1·sim(anchor, last_good_window) + w2·quality_rank + w3·is_seed − w4·times_restored`.

   `last_good_window` holds the embeddings from just *before* the degradation onset. Choosing by that
   similarity tries to return the player to something resembling where they were. It is a visual
   heuristic, not a location claim.
   If no approved anchor exists, the fallback is the original seed via existing `/world/reset`.
   An optional fallback is a **pre-generated, cached, reviewed** same-theme SDXL image. Generating SDXL live
   requires stopping the world (`/scenes/generate` returns 409 while a world is paused) and creates a new
   world, so it is never an in-session recovery path.
3. **Restore** through the existing tested `/world/checkpoints/restore` (raw variant) or `/world/reset`.
   No new GPU lifecycle code.
4. **Record the discontinuity.** Restore already creates a new `segment_id` with
   `relationship:'restored_view'`. This design adds `segment.anchor = {kind, checkpoint_id|null}` and a rule:
   the frontend must **not** draw a trail edge across segments. The existing `reposition()` copies the
   checkpoint's estimated pose into the new segment. That is acceptable only as *"restored near where this
   anchor was captured (estimated)"*, drawn as a dashed "restored from" link, never as a walked path.
5. **Preserve history.** Old observations, trajectory and degraded frames remain stored and flagged. They
   are never deleted or replaced by enhanced images.
6. **Default mode is MVP-manual.** The UI shows "Scene may be degrading. Restore to <thumbnail>?". Auto-restore
   is a flag for experiments only, because NATIVE720_UPDATE notes that "manual Refresh is less surprising
   than an unexplained timed teleport".

How we evaluate whether memory helps recovery (not assumed): run a blinded human A/B comparison of
**memory-selected anchor** vs **always original seed** vs **most recent approved checkpoint**. Raters score
continuity ("does this feel like I came back to roughly where I was?") and disruption on a 1–5 scale. See
MVP_IMPLEMENTATION_PLAN.md §Tests T9.

## 6. Architecture review: tool recommendations

| Need | Recommendation | Why | Rejected / deferred |
|---|---|---|---|
| Global image embedding / VPR | **DINOv2-small** (`facebook/dinov2-small`, ~22 M params, 384-d CLS + mean-patch), CPU, 224 px | Strong off-the-shelf retrieval features, small, Apache-2.0, works on CPU | CLIP ViT-B/32 (already cached, measured 47 ms p50 CPU at 2 threads; acceptable **fallback**, but tuned for text alignment, not place discrimination). Heavy VPR heads (AnyLoc, SALAD, MegaLoc): more accuracy than this problem can use and more VRAM/latency. NetVLAD: needs training |
| Near-duplicate detection | **dHash 64-bit** (pure numpy) plus embedding cosine | Microseconds, no model | pHash via OpenCV is fine too |
| Relative depth | **Depth Anything V2 Small**, CPU, sparse (calibration views and keyframes only), reduced to a 3×3 relative-depth layout descriptor | Already pinned and cached; measured ~1.7 s CPU per image at 4 threads | Running per frame (too slow on CPU, contends on GPU). Metric depth models (would invite false metric claims) |
| Quality evaluation | Existing `inspect_image` indicators **plus** per-world baselines from calibration, colourfulness, edge density, temporal instability, semantic drift vs approved set. Optional experimental `pyiqa` NIQE/BRISQUE on CPU | Cheap, per-world relative; no single score is trusted | Blind CLIP approval gate (shown to fail) |
| Image-space motion during turns | **Phase correlation in `numpy.fft`** on 160×90 grayscale strips (~10 lines; OpenCV `phaseCorrelate` is equivalent, but `cv2` is not installed in the accepted environment, whose packages must not change) | Gives horizontal pan in pixels, an INFERRED signal for turn magnitude | Full optical flow (overkill) |
| Sequence matching | **SeqSLAM-style** diagonal search over a cosine-similarity matrix, constrained by dead-reckoned heading change | Robust to single-frame aliasing, cheap | Learned sequence matchers |
| State estimation | **Dead reckoning with explicit 2-D uncertainty growth** plus a small discrete hypothesis filter (HMM over 4 states) | Honest and interpretable; images never "correct" coordinates | EKF/particle filter fusing image matches into position: requires a measurement model of a generative scene that we do not have |
| Vector search | **numpy brute-force** cosine over ≤1,024 × 384 float16 per world | <1 ms; no dependency | FAISS (unnecessary at this scale; revisit at >50k vectors) |
| Storage | **SQLite (stdlib, WAL)** per world plus raw JPEG files on disk | Transactions, crash safety on Windows, queryable, zero infra | Postgres/vector DB (unneeded); JSON rewrite per save (current `world.json` pattern does not scale to hundreds of observations) |
| Backend scheduling | asyncio bounded queue → one `multiprocessing` worker (spawn), `torch.set_num_threads(4)`, `psutil` BELOW_NORMAL priority | Isolates GIL and CPU from the stream loop | Celery/Redis (unnecessary) |
| Browser visualization | **Canvas 2D or SVG in React** (the existing stack), per-segment coordinate frames, uncertainty ellipses | No new dependency | Three.js/WebGL 3-D map (implies geometry we do not have); Leaflet (geographic connotation) |
