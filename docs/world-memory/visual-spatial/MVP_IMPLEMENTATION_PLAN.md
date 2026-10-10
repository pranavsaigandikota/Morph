# MVP Implementation Plan

Status: **PLAN**. No code in this plan has been written yet. Work belongs on
`feature/worldshift-spatial-memory-backend` (backend, isolated port 8002) and a Cursor UI branch.
Production 8000 and release `6423304` stay untouched, and the frozen-hash manifest check must keep passing.

## 1. Capability status at the start

| Capability | Status |
|---|---|
| Native 720p Waypoint stream, SDXL HIGH seed, checkpoints, SHA-256, review, raw restore, reset, dead reckoning, JSON memory events, bounded storage | **IMPLEMENTED** (GPU-tested in isolation) |
| Depth Anything V2 Small / OWL-ViT offline CPU analysis; CLIP CPU diagnostic; risk-budget recovery; 4-frame presenter queue | **EXPERIMENTAL** (scripts or experiment branches, not product API) |
| Calibration, observation store, embeddings, sequence matching, hypotheses, uncertainty, visual-memory REST and events, map UI, degradation suggestions | **PROPOSED** (this folder) |

## 2. Phases

Sizes: **S** ≈ half a day, **M** ≈ 1 day, **L** ≈ 2 days for one engineer. These are planning guesses.

### Phase A: guided calibration and screenshot capture (M + probe S)

| Work | Reuses | New |
|---|---|---|
| A0 turn-gain probe script and contact sheet | `test-memory-gpu.mjs` WS client pattern, `batches.jsonl` | `experiments/probe-turn-gain.mjs`, a pan analysis script (numpy-FFT phase correlation, CPU, offline) |
| `ControlSource` seam in `run()` | `service.py` run loop, the 0.5 s timeout logic, moved verbatim into `PlayerControlSource` | `CalibrationControlSource`, `origin` field in `batches.jsonl` |
| `CalibrationController` (`four_out_and_back`, `small_arc`) | `Service.action('reset')` for the safe exit; lifecycle and GPU locks; `inspect_image` | `calibration.py` |
| Observation persistence (synchronous analysis is acceptable in A, but only for calibration views) | `Memory` world folder, SHA-256 pattern, `write_json` atomic pattern | `observation_store.py` (SQLite) |
| REST: calibration start/get/cancel, observation get/image/review | `memory_service.py` route style, `Strict` models, 404/409/507 conventions | routes |

Done when T1, T2 (four-direction), T3 and T10 pass and a human has reviewed calibration strips from ≥3 scenes.

### Phase B: automatic exploration snapshots and trajectory estimation (M)

| Work | Reuses | New |
|---|---|---|
| Capture triggers and the bounded queue, called from the existing `Memory.batch` hook | `Memory.batch` (already receives `jpeg[-1]`, `meta`, `keys`, `mouse`) | `ObservationCapture` |
| Pre-persist dedup (dHash) | — | numpy dHash |
| Uncertainty propagation (`sigma_xy`, `sigma_yaw`); keep `confidence` | `Navigation.apply` | ~15 lines added to `Navigation` |
| Segment table with `anchor`; `pre_restore` capture | `reposition()`, `restore()`, reset path | segment rows |
| Running byte counter (avoid the O(n) glob) | quota pattern | `counters` table |

Done when T3, T4, T7 and T8 (capture only, no models yet) pass.

### Phase C: visual place recognition and confidence-aware prediction (L)

| Work | Reuses | New |
|---|---|---|
| CPU analysis worker process | CPU-forcing and thread-cap pattern from `analyze-checkpoint-cpu.py` and `semantic-clean-check.py`; pinned offline HF cache | `analysis_worker.py` |
| DINOv2-small (pin revision, cache offline); CLIP fallback (already cached) | `download_sdxl.py` pinning pattern | download script |
| `MemoryIndex`, sequence matcher, null distribution, hysteresis | — | `localizer.py` |
| Depth layout grid, token-bucketed | Depth Anything code path in `analyze-checkpoint-cpu.py` | small wrapper |
| Events `observation_*`, `localization_update`, `revisit_candidate` | `Memory.emit` (never consumes credits) | — |

Done when T5, T6 (with human labels) and T8 (full) pass. Precision is reported per scene.

### Phase D: Cursor live map integration (M–L, Cursor)

> **Revision 2026-10-10:** the Explorer, map, gallery, restore overlay and obstacle overlay **already
> exist in MOCK** on `feature/worldshift-visual-memory-ui` @ `0bf4f9b`. Phase D is now "replace the mock
> client with a live adapter", not "build the map". See §6 and
> [CURSOR_IMPLEMENTATION_HANDOFF.md](CURSOR_IMPLEMENTATION_HANDOFF.md).

Build against the MOCK fixtures first, then the live endpoints. The contract is
[CURSOR_FRONTEND_CONTRACT.md](CURSOR_FRONTEND_CONTRACT.md). Done when the §8 UI acceptance checks pass and
the T11 visible browser run shows FPS within the T8 gates **with the map open**.

### Phase E: optional quality-aware restoration and memory retrieval (M)

| Work | Reuses | New |
|---|---|---|
| `DegradationMonitor` (advisory) | Risk-budget indicators from NATIVE720_UPDATE; `inspect_image` | monitor + `degradation_suspected` event |
| Anchor ranking and `/world/recovery/suggestions` | Approved checkpoints; `/world/checkpoints/restore`; `/world/reset` | ranking function |
| "Restore to…" UI prompt (manual by default) | Existing restore lifecycle and canvas hold | UI |

Done when T9 (human A/B) is complete and reported, **whatever the result**. If memory-selected anchors
do not beat "always seed", say so and keep the simpler default.

**Minimum demo cut** if time is short: A + B + a read-only map of trail, segments, calibration fan and
thumbnails (D without revisit links). Revisit links ship only after T6 precision is measured.

## 3. Test plan

Two harnesses:

- **Synthetic harness (code validation only).** A `FakeBackend` replaces Waypoint. It renders 1280×720
  crops from a procedurally generated wide panorama, where yaw maps to a horizontal crop offset and forward
  movement maps to a zoom. Ground truth is known by construction. It validates control plumbing, pan sign,
  return checks, dedup and sequence matching on planted revisits. Every artefact is labelled
  **SYNTHETIC**. It says nothing about Waypoint's behaviour.
- **GPU harness.** Real Waypoint 720p and real SDXL seeds. One world at a time, HF offline, unique run
  folders (existing `test-memory-gpu.mjs` pattern).

Scenes: ≥3 distinct SDXL HIGH seeds, for example (1) the approved Florida post-hurricane street (scene
`9bda60c5…`, seed 20261011); (2) a dense downtown city street; (3) an underwater research lab interior;
(4, optional) a forest trail. Indoor and forest scenes are the high-aliasing stress cases.

| ID | Test | Harness | Pass criteria |
|---|---|---|---|
| T1 | Calibration 4- vs 8-direction | synthetic + GPU (≥3 scenes × 3 runs × {four_out_and_back, eight_out_and_back}) | Synthetic: captured crop offsets match the commanded headings exactly; return checks pass. GPU: report the per-mode abort rate, per-heading quality relative to seed, return-check cosine distribution and human "recognisable" rate. **Decision rule:** eight-direction becomes available only if its abort rate is ≤ the four-direction rate + 10 pts and human-recognisable views are ≥ 80% |
| T2 | Turn drift and failed calibration | GPU + fault injection | `eight_continuous` drift curve: cosine to forward₀ against cumulative turn. Injected faults (uniform frame, stop mid-run, disconnect, restore mid-run, client control during calibration) each yield the documented outcome, end in `/world/reset` with a new epoch, and leave no scripted control active afterwards |
| T3 | Hash provenance | unit + GPU | For every observation, `sha256(file) == raw_sha256 ==` the SHA-256 of the JPEG bytes the client received for that `frame_id` (the test client hashes received bytes). Promote keeps the SHA. The worker rejects a tampered file. Thumbnails never served as `variant=raw` |
| T4 | Deduplication | synthetic + GPU idle run | A 60 s idle (no input) run persists ≤ 1 observation per interval *of distinct content*; `suppressed_duplicates` > 0. Planted duplicates in a synthetic run are suppressed. No dedup across segments |
| T5 | Position/heading prediction | unit + synthetic + GPU | Unit: existing `NavigationTests` still pass; σ grows monotonically with motion and turns. Synthetic: hypothesis matches ground-truth area labels at ≥ 90%. GPU: scripted out-and-back walks (W 3 s → turn → W 3 s → turn back → S…) are compared with **human labels** of "new area / same area / revisit". Report a confusion matrix. No pass threshold on GPU at MVP; it is a measurement |
| T6 | False-positive place recognition | GPU + human | **Known negatives:** pairs across *different worlds generated from the same theme prompt* cannot be the same place. Run the matcher with cross-world matching force-enabled in test mode only. Gate: sequence-level FP rate on these ≤ 2% at the chosen threshold. Report single-image FP rate for contrast. Human-labelled within-world pairs (≥300): report precision with a Wilson 95% CI. Ship revisit links only if precision ≥ 0.8 |
| T7 | Restoration and segments | GPU | After restore or reset: new epoch, new `segment_id`, the `segment.anchor` kind is correct, `geometric_continuity:'none'`, a `pre_restore` observation exists, no trail edge across segments in the snapshot, revisit candidates suppressed during grace, old observations untouched (SHA re-verified) |
| T8 | Resource limits | GPU | All gates in GPU_RESOURCE_PLAN §5. Quota behaviour: forced small limits produce sparse → full → `memory_quota` with no deletion of raw files. Queue overflow counted; no video drop increase |
| T9 | Recovery usefulness | GPU + human | Blinded A/B/C: memory-selected anchor vs original seed vs latest approved checkpoint. ≥10 degradation events per arm across ≥3 scenes. Raters score continuity and disruption on 1–5. Report the result even if it is null |
| T10 | Session/epoch isolation | unit + GPU | Stale `session_id` returns 404. Old-epoch analysis results are stored but emit no live events. Stop/start creates a new DB with no cross-world candidates. Two sequential worlds never share an index. Calibration cannot start while a lifecycle lock is held (409) |
| T11 | 60-second real GPU exploration | GPU, visible browser, map open | Per scene: 60 s mixed trajectory after calibration; capture every `localization_update`; produce a contact sheet, map screenshot and report.json. Gates: T8 performance gates, zero protocol errors, all observations hashed and analysed or explicitly skipped. Visual quality is **reported, not gated**, since drift is a known Waypoint property |

## 4. Human review methodology

Synthetic metrics and embedding similarity cannot establish spatial consistency in generated video.
Human judgement is the reference. Agent inspection is recorded as "agent review" and never counted as
human review, the same rule as RESULTS.md.

1. **Raters:** ≥2 people, at least one not involved in building the feature.
2. **Tasks:**
   - *Calibration review*: accept/reject each view. "Is this a recognisable view of the same scene?"
   - *Pairwise same-place*: randomised, **blinded** pairs (no scores, no IDs, no poses shown). The mix is
     system revisit candidates, random within-world pairs, calibration return pairs and cross-world
     same-theme pairs (known negatives, which act as rater attention checks). Scale: 1 = clearly
     different place … 5 = clearly the same place.
   - *Sequence review*: for top candidates, show the 5-frame query strip above the matched strip.
   - *Recovery A/B* (T9).
3. **Agreement:** quadratic-weighted Cohen's kappa between raters. If kappa < 0.4, the label set is too
   noisy to calibrate on. Refine the instructions and re-rate a subset.
4. **Use:** labels fit the score calibration (LOCALIZATION §8) and thresholds. Labels are stored in
   `observation_link.human_same_place` with the reviewer ID and timestamp.
5. **Tooling:** the review strip in the map UI (Phase D). Before that exists, use a static HTML page
   generated from an exported JSON of pairs. Raw images are referenced by SHA-256.

## 5. Proposed file-level changes (backend branch)

```
experiments/backend/worldshift/
  service.py            ~10 lines: ControlSource seam; 'origin' in batch row        (modify)
  memory.py             Navigation sigma; Memory.batch → ObservationCapture.on_batch;
                        segment anchor on reposition; pre_restore capture hook      (modify)
  control_source.py     PlayerControlSource / CalibrationControlSource             (new)
  calibration.py        CalibrationController                                       (new)
  observation_store.py  SQLite store, counters, quota                               (new)
  analysis_worker.py    CPU process: quality, dHash, DINOv2, depth grid             (new)
  localizer.py          MemoryIndex, sequence matcher, hysteresis, degradation      (new)
  memory_service.py     additive routes                                             (modify)
experiments/tests/      test_calibration.py, test_observation_store.py,
                        test_localizer.py (synthetic), test_isolation.py            (new)
experiments/            probe-turn-gain.mjs, test-visual-memory-gpu.mjs,
                        fake_backend.py (SYNTHETIC)                                  (new)
```

New dependencies: **none in the accepted Python environment**. The README requires leaving its packages
unmodified. Checked 2026-10-10: `torch`, `transformers`, `numpy`, `PIL` and `psutil` are importable, and
`cv2` is **not**. Phase correlation is therefore ~10 lines of `numpy.fft`, not OpenCV. `sqlite3` is in the
standard library. The only new artefact is the DINOv2-small weights at a pinned revision, downloaded into
the existing offline cache. No FAISS, no database server, no queue broker.

## 6. Integration plan (revision 2026-10-10)

This revision follows the frontend review ([FRONTEND_COMPATIBILITY_REPORT.md](FRONTEND_COMPATIBILITY_REPORT.md))
and the API gap analysis ([BACKEND_API_GAP_ANALYSIS.md](BACKEND_API_GAP_ANALYSIS.md)). Phases use the
integration lettering requested on 2026-10-10. The mapping to §2 is given for traceability.

| Integration phase | Maps to §2 | Starts before A0? | Priority | Owner |
|---|---|---|---|---|
| **C: estimated movement and heading** (live adapter on IMPLEMENTED `navigation`/`trajectory`) | B (uncertainty) + existing nav | **Yes, now.** Headings labelled nominal | **1** | Cursor (adapter); Codex (K2–K7, additive) |
| **D: visual memory gallery and map** (live checkpoints, review, restore, segment breaks) | D | **Yes, now** | **1** | Cursor |
| **B: automatic snapshot collection** (observation store, triggers, dedup) | B | **Yes.** Time/translate/settle triggers need no A0. The turn trigger ships with a provisional mouse-unit threshold | **2** | Codex; Cursor UI after endpoints exist |
| **A: guided calibration and directional screenshots** | A | **Partly.** Seam, controller, safe exit, synthetic tests and UI shell now; **enabling it for players is blocked on A0** | **3** | Codex (A0 owner); Cursor (UI shell on MOCK) |
| **E: sequence-based possible-place recognition** | C | **Partly.** Worker, embeddings and matcher on the synthetic harness can start after B. Thresholds and the heading-consistency check need A0 plus human labels | **4** | Codex |
| (F, optional) quality-aware restoration | E | Yes, after D | 5 | Codex + Cursor |

Ordering rationale: C and D give a working live demo using only endpoints that already exist and were
GPU-tested. B adds evidence volume. A is the only phase whose core parameter (mouse units per intended
turn) is unknown. E is the riskiest claim and needs the most human labelling, so it comes last.

What specifically waits for A0 is listed in
[CODEX_CALIBRATION_HANDOFF.md §3](CODEX_CALIBRATION_HANDOFF.md#3-what-depends-on-a0).
