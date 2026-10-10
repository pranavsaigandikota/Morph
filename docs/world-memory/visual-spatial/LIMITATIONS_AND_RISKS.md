# Technical Limitations and Risks

> **Revision 4 status (2026-10-10):** Phase A0 is **complete, result NO-GO** for reliable fixed-angle turning (Codex: 21 GPU trials, 3 scenes; trial report not yet published in the repo). **Guided manual calibration is approved without degree mapping** (soft labels only). Automated or fixed-angle calibration is **BLOCKED(A0 NO-GO)**, not scheduled. Canonical LIVE contract: [LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md](LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md). Source-qualified doc links: [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

## 1. What can and cannot be established

| Question | Answer with this system | Class |
|---|---|---|
| Which exact frames did the player see? | Yes. Byte-identical streamed JPEGs, SHA-256, `frame_id`, epoch | **MEASURED** |
| Which controls were applied, when, to which batch? | Yes. `batches.jsonl` and `applied_controls` per observation | **MEASURED** |
| How long, in generated time, did the player move or turn? | Yes, counted in applied batches | **MEASURED** |
| Where is the player relative to the start? | Only as a control-history estimate in arbitrary units, with growing uncertainty, within one segment | **ESTIMATED** |
| Which way is the player facing? | Nominal yaw from mouse units. The mapping to visual rotation is unknown until the A0 probe, and even then it is a human estimate | **ESTIMATED** |
| Did a calibration turn reach 45°/90°? | No. Only "the image panned by N px in the commanded direction" and a human's rough judgement | **INFERRED / REVIEWED** |
| Is the current view similar to an earlier one? | Yes, as embedding similarity, best as a sequence-level match strength | **INFERRED** |
| Is the player in the same place as before? | **Cannot be established.** No persistent place exists to return to. At best, "humans judge these views to look like the same place" | **UNKNOWABLE** (proxy: REVIEWED) |
| How far away is that building? | Within-image relative depth rank only. No metric depth, no cross-frame scale | **INFERRED** (relative) / metric **UNKNOWABLE** |
| Camera FOV, focal length, true pose | **Cannot be established** | **UNKNOWABLE** |
| Is the path ahead walkable / is that an obstacle? | **Cannot be established.** Waypoint has no collision. Detector boxes and depth ranks are not traversability | **UNKNOWABLE** |
| Does content persist when off-screen? | **No guarantee.** Waypoint regenerates from context, and turning back may show something different | **UNKNOWABLE** (measurable only as return-check similarity) |
| Is a frame "clean"? | Weak indicators and per-world relative scores, then human review. A learned score (CLIP) already failed to separate approved from rejected | **INFERRED → REVIEWED** |
| Are two segments geometrically connected after a restore? | **No.** By construction they are not, and they are never drawn as connected | — |

## 2. Limitations of the approach

1. **Not SLAM.** No map optimisation, loop closure or pose graph. Nothing corrects drift, because no
   geometry exists to correct against.
2. **Arbitrary scale and units.** Distances on the map mean "generated seconds of walking" at most. Two
   segments cannot be compared in scale.
3. **Unknown turn gain.** The existing 0.002 rad/unit constant is arbitrary, and previous tests used ~1–3
   mouse units per batch. Until the A0 probe runs, nominal yaw and what the player sees may disagree badly.
4. **Theme aliasing.** Generated worlds repeat motifs. Even sequence matching will produce some false
   revisits. Precision is measured (T6), not assumed.
5. **Blob-to-blob similarity.** Degraded frames embed close to each other. Revisit detection depends on the
   degradation flag, which is itself imperfect.
6. **Calibration consumes generation steps.** The look-around exposes the model to rotation before
   exploration starts. This is mitigated by the out-and-back pattern and the mandatory reset to the seed
   afterwards.
7. **Settling is not free.** Idle generation can drift, so "wait for the view to stabilise" may wait for a
   slowly degrading view.
8. **"Raw" means encoded JPEG.** Evidence is the q85 JPEG sent to clients, not the decoder's float output.
9. **Human review is the bottleneck.** Every honest confidence claim needs labels, and labelling takes time.
10. **No session resume** across process restarts (existing behaviour). Archives persist; live state does not.

## 3. Observations about the existing code that affect this design

These come from reading branch `ad71609`. They are not defects in the current scope, but the new features
must handle them.

| Observation | Location | Impact / proposed handling |
|---|---|---|
| `reposition(cp)` copies the checkpoint's estimated pose into the new segment | `memory.py` `Memory.reposition` | Acceptable only if the UI never draws a trail edge across segments. Add `segment.anchor` and `geometric_continuity:'none'` (CURSOR_FRONTEND_CONTRACT §4) |
| `confidence` decays linearly and ignores turn vs translation | `Navigation.apply` | Add `sigma_xy`/`sigma_yaw` and keep `confidence` derived for compatibility |
| Quota check globs every file under `world_memory` on each save | `Memory.save` | Fine at 32 checkpoints. Observation writes must use a running counter |
| Controls zero after 0.5 s without input; mouse accumulates and is clamped ±1000 per batch | `service.py` `run()` / receiver | The calibration controller must drive controls server-side, once per batch (`ControlSource` seam) |
| Periodic candidates capture only the last frame of each 4-frame batch | `service.py` → `Memory.batch(jpeg[-1], …)` | Observations inherit this. Adequate for memory; noted for provenance |
| Memory events are dropped when a subscriber queue has ≥6 items | `Memory.emit` | Map clients must refetch REST snapshots after gaps (`event_seq`) |
| Turn trigger compares yaw with the yaw at the last save | `Memory.batch` | Observation triggers use accumulated \|mouse\| instead, so back-and-forth turns count |

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation | Owner/test |
|---|---|---|---|---|---|
| R1 | Users read the map as a real map ("I'm 12 m north of the house") | High | High (trust) | Evidence styling, legend, forbidden-copy list, halos, per-segment islands | Cursor, UI checks |
| R2 | False revisit links presented confidently | Medium–High | High | Sequence matching, per-world null, z-thresholds, cross-world negatives in T6, ship links only at ≥0.8 measured precision, score labelled uncalibrated | T6 |
| R3 | CPU analysis reduces stream FPS or adds input latency | Medium | High | Separate low-priority process, thread cap, token-bucket depth, backpressure order, T8 gates | T8 |
| R4 | GIL or event-loop stalls from inline work in the service process | Medium | High | `Memory.batch` stays O(1); everything heavier goes to `to_thread` or the worker; loop-lag metric | T8 |
| R5 | Eight-direction calibration drifts severely | High (expected) | Medium | Default four out-and-back, data-driven decision rule, small-arc fallback, reset afterwards | T1, T2 |
| R6 | Turn-gain probe finds no magnitude that both turns visibly and stays clean | Medium | Medium | Small-arc mode; calibration becomes "forward plus slight look"; feature still useful for the seed reference set | A0 |
| R7 | Disk fills during long demos | Low–Medium | Medium | Running counters, sparse mode, `memory_quota`, no auto-delete, manual archive | T8 |
| R8 | Degradation detector fires falsely (annoying prompts) or misses | High | Medium | Advisory only, hysteresis, cooldown, manual default; evaluate with humans | T9 |
| R9 | Memory-selected anchors are no better than the plain seed | Medium | Low | Measure (T9). If true, keep the seed default and say so | T9 |
| R10 | Human labels are noisy (low kappa) | Medium | Medium | Clear rubric, attention checks from known negatives, re-rate | §4 of MVP plan |
| R11 | Scope creep into obstacles/collision | Medium | High | Out of scope here. OBSTACLE_SCHEMA_PROPOSAL stays separate and unactivated. No depth→collision path | Review |
| R12 | Confusion with the Rescue grid | Low | Medium | Separate namespaces and titles (contract §6) | Cursor |
| R13 | DINOv2 weights unavailable offline at demo time | Low | Medium | Pin and pre-cache; fall back to the cached CLIP B/32 with `embedding_model` recorded | Phase C |
| R14 | Race between calibration and user restore/reset/stop | Medium | Medium | Calibration holds a state flag; lifecycle actions cancel it; the safe exit is idempotent | T2, T10 |
| R15 | ~~Branch `feature/worldshift-visual-memory-ui` unseen~~ **Resolved (rev. 2):** the branch exists (@ `0bf4f9b`). The first revision's "not found" came from a local TLS failure: Norton intercepts HTTPS, and `git -c http.sslBackend=schannel` with verification on resolved it. Reviewed in FRONTEND_COMPATIBILITY_REPORT. Residual risk: the frontend's provisional types differ from the backend wire shape (axes, degrees, confidence polarity) | Resolved → Medium | Medium | A single mapping module with unit tests (Cursor C1) | Cursor |
| R16 | `docs/world-memory/API_CONTRACT.md` exists on both branches with different content (frontend "PENDING" placeholder vs backend v1 contract) | Mitigated (rev. 4) | Medium | Source-qualified, commit-pinned links ([DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md)); at merge, rename the backend file and drop the placeholder (K8) | Codex + Cursor |
| R17 | The frontend stream hook adopts the epoch from **any** JSON message, so a memory event with a mismatched epoch would flush presentation frames | Low today | High | Codex invariant K3 with a test; frontend stream code frozen | Codex |
| R18 | The frontend defaults to port 8000, which has no memory routes; a live demo silently stays on MOCK or 404s | Medium | Medium | `ENGINE_TARGET=http://127.0.0.1:8002`; live client shows "Memory unavailable" on 404 | Cursor |
| R19 | Frontend anchor policy (`waypoint_frame` never restorable) vs backend review-gated restore leaves the gallery's restore buttons mostly disabled | High | Low | Product decision, documented. Default `approved && policy` | Product owner |
| R20 | A0 finds rate-dependent or scene-dependent turn gain, so no single units-per-degree value exists | **Occurred (rev. 4):** A0 NO-GO, 21 trials, 3 scenes | Medium | Automated/fixed-angle calibration BLOCKED(A0 NO-GO); guided manual calibration with soft labels approved; no degree values displayed | Codex / Claude |
| R21 | A0 NO-GO evidence is not published in the repository, so the decision is not independently auditable | Current | Low–Medium | Codex commits the trial report on the backend branch; link it in DOCUMENTATION_SOURCES | Codex |
| R22 | `:8000` is mistaken for a 360p product fallback | Medium | Medium | `:8000` is archived, regression-only; product acceptance on `:8002` (LIVE contract §8) | All |

## 5. Claims we must not make

- "WorldShift maps the world", "SLAM", "localization accuracy of X m", "collision-aware", "pathfinding".
- "Calibrated 360° view" or "panorama".
- "The AI remembers the place and regenerates it consistently". Memory is ours; Waypoint has none
  beyond its context window.
- "Memory fixes visual drift". At most, memory helps **choose** a recovery anchor, and only once T9 shows it.

What we **can** say: *"WorldShift keeps a verifiable record of every view you saw, estimates roughly
where you were heading from your controls, and flags when a view looks similar to something you saw
before, with how sure it is and why."*
