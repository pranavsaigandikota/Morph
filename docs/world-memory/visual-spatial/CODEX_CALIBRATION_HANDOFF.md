# Codex Handoff: Phase A0 Turn-Gain Probe and Calibration-Dependent Backend Work

**For:** Codex (owner of `feature/worldshift-spatial-memory-backend`, isolated 8002 service; running A0)
**Read with:** [CALIBRATION_WORKFLOW.md](CALIBRATION_WORKFLOW.md), [BACKEND_API_GAP_ANALYSIS.md](BACKEND_API_GAP_ANALYSIS.md)

## 0. Constraints

- **No Waypoint inference changes.** `backend.py` (`generate`, `restore_anchor`, `reinitialize`) stays as
  it is. The calibration seam (K9) lives in the service loop (`service.py run()`), which chooses *which
  controls* are passed to `generate`. It does not change how they are processed.
- One GPU world at a time. HF offline. Unique run folders. Production 8000 and release `6423304` untouched.
- All new API fields are **additive and optional**. Update `docs/world-memory/API_CONTRACT.md` on the
  backend branch with an explicit status (IMPLEMENTED / PLANNED / PROPOSED) for each change.

## 1. Phase A0 protocol (refined after the frontend review)

**A0 needs no backend code changes.** The existing WebSocket control path is enough. A probe client sends
`{type:'control', keys:[], mouse_dx, mouse_dy:0}` every 50 ms. The service accumulates `mouse` per batch,
clamps it to ±1000, and zeroes it after 0.5 s of silence. **Use `batches.jsonl` (`mouse` per batch) as
the MEASURED applied value**, not the client-sent values.

Why the range changed: existing backend tests used ~1–3 units/batch. The frontend's real operating range is
much larger. `lookControl.ts` caps at 28 units per 50 ms tick (≈ up to 84 per ~145 ms batch) at default
sensitivity 0.22, and Stability Mode auto-resets after **320 cumulative |mouse_dx|**, described as "well
before a full-circle melt is typical". That is an informal observation, not a measurement; A0 should test it.

| Sweep | Design | Values |
|---|---|---|
| **S1: fixed duration** | Reset to seed → `K=10` batches at constant per-batch magnitude `m` → 4 zero-input batches → reset | `m ∈ {1, 2, 4, 8, 16, 32, 64, 84}` units/batch, positive direction |
| **S2: fixed cumulative** | Reset → reach Σ\|dx\| = 320 at per-batch rate `r` → 4 zero batches → reset | `r ∈ {8, 32, 84}` (tests rate dependence) |
| **S3: return symmetry** | Reset → +Σ at rate `r*` → settle → −Σ → settle; compare to start | Σ = the S1/S2 amount a human judged ≈ 45° and ≈ 90°; `r*` = best rate from S2 |
| **S4: direction sign** | Same as S1 at `m*`, negative direction | 1 value |

Run all four sweeps on **3 distinct scenes** (for example the approved Florida street, a dense city street
and an indoor/underwater lab), from approved SDXL HIGH 1280×720 seeds. Use `mouse_dy = 0` and no keys
throughout.

Per batch, record: `batch_id`, applied `mouse` (from `batches.jsonl`), JPEG SHA-256, quality indicators
(`inspect_image`) and **phase-correlation pan in pixels** (numpy FFT, 160×90 grayscale, consecutive
batch-last frames; CPU, offline, after the GPU run).

Human labelling, blinded to `m` where possible: per run, a contact sheet of start, every 2nd batch and
end. The rater picks a turn bucket (`<15°`, `~30°`, `~45°`, `~90°`, `>90°`, `unclear/degraded`), says
whether the end view is still recognisable, and (S3) whether the returned view is the same scene as the
start (1–5). Agent inspection is recorded separately and is not a human rating.

## 2. A0 output artifact (the input for everything in §3)

Commit `experiments/a0/turn_gain_probe.json` (plus contact sheets and raw evidence paths):

```jsonc
{
  "probe_version": 1, "date": "2026-10-xx", "model": "Overworld/Waypoint-1.5-1B", "quant": "fp8w8a8",
  "resolution": [1280, 720], "reviewers": ["…"],
  "scenes": [{ "scene_id": "…", "seed_sha256": "…" }],
  "runs": [{
    "sweep": "S1", "scene_id": "…", "units_per_batch": 16, "batches": 10,
    "applied_mouse_sum_measured": 160.0,
    "pan_px_per_batch_median": 0.0, "pan_sign_consistency": 0.0,        // INFERRED
    "quality_end_vs_start": { "laplacian": 0.0, "luma_std": 0.0 },
    "human_turn_bucket": "~45°", "human_recognisable_end": true,         // REVIEWED
    "return_same_scene_score": null, "evidence_dir": "…"
  }],
  "recommendation": {
    "units_per_intended_45deg": null,          // human estimate, or null if no stable mapping
    "step_units_per_batch": null,
    "max_cumulative_before_return": null,      // largest Σ that stayed recognisable on all 3 scenes
    "positive_dx_turns": "right|left|inconsistent",
    "rate_dependent": true,
    "sigma_yaw_prior_rad": null,               // e.g. 0.35 if buckets were consistent across scenes, else π/2
    "recommended_calibration_mode": "four_out_and_back|small_arc|disabled",
    "source": "human_estimate_from_probe",
    "confidence": "low|medium"                 // never "high": this is a visual bucket judgement
  }
}
```

If scenes disagree by more than one bucket for the same Σ, set `units_per_intended_45deg: null` and
`recommended_calibration_mode: "small_arc"` or `"disabled"`. Do not average the scenes into a false
precision.

## 3. What depends on A0

| Backend feature | Depends on A0? | Which A0 output | Until A0 lands |
|---|---|---|---|
| Calibration controller *enabled for players* | **Yes, blocking** | `units_per_intended_45deg`, `step_units_per_batch`, `recommended_calibration_mode` | Build and test behind `WORLDSHIFT_CALIBRATION=off` with the FakeBackend |
| Choice of 4 vs 8 directions vs small arc | **Yes** | `max_cumulative_before_return`, S3 scores | Default `four_out_and_back`, disabled |
| "Turn took effect" and direction checks in calibration | **Yes** | `pan_px_per_batch_median`, `positive_dx_turns` | Synthetic thresholds only |
| `Navigation` yaw constant (0.002 rad/unit) | **Maybe** (versioned change) | `units_per_intended_45deg` | Keep 0.002. Expose it via `nav_model` (K6) so a later change is visible |
| `sigma_yaw` prior (K7) | **Yes** (value only) | `sigma_yaw_prior_rad` | Use π/2 (heading essentially unknown) |
| Observation turn trigger (Phase B) | **Soft** | `units_per_intended_45deg` (~30° threshold) | Provisional threshold: Σ\|dx\| ≥ 120 units (configurable, labelled provisional) |
| Sequence-match heading-consistency check (Phase E) | **Yes** | `sigma_yaw_prior_rad`, sign | Disable the check; rely on z-score, order and quality |
| Calibration negatives for the per-world null distribution (Phase E) | **Yes** (needs calibration views) | — | Use within-segment far-apart negatives only, and report `insufficient_negatives` |
| Observation store, dedup, time/translate/settle triggers, quota | No | — | **Start now** |
| CPU analysis worker, DINOv2 embeddings, MemoryIndex, synthetic sequence matcher | No | — | **Start after the store** |
| K2–K6, K8 contract fixes (§4) | No | — | **Start now** |

## 4. Backend work items, prioritised

All are additive. Each must update API_CONTRACT.md and RESULTS.md with tested status.

| ID | Item | Why (consumer) | A0? | Priority |
|---|---|---|---|---|
| **K8** | Resolve the `docs/world-memory/API_CONTRACT.md` path collision: publish the v1 contract with a status table, and tell Cursor to drop its "PENDING" placeholder at merge | Otherwise either merge conflicts or the wrong contract wins | No | **P0** |
| **K3** | Invariant and test: every memory event's `epoch` equals the current service epoch at emit time, and none is emitted between `epoch += 1` and the post-restore `status` message | The frontend stream hook adopts the epoch from **any** JSON message and flushes frames | No | **P0** |
| **K5** | `capture_reason: 'initial_seed'|'manual'|'periodic'` on checkpoints | The frontend cannot reliably tell manual from auto (it currently string-matches `label`) | No | P1 |
| **K4** | `restored_from_checkpoint_id` on the `restored_view` trajectory point (null for reset → use `anchor:'reset_to_seed'`) | "Restored from" labels on the map | No | P1 |
| **K2** | Light navigation read: `GET /world/memory?…&trajectory_since=<n>`, or `GET /world/navigation`, plus a configurable `navigation_update` rate (default 1 Hz, max 5 Hz) | The frontend wants 5–10 Hz and polling the full snapshot is heavy | No | P1 |
| **K6** | `nav_model: {version, yaw_rad_per_unit, units_per_second, source:'nominal_constant'|'human_estimate_from_probe', probe_report?}` in `GET /world/memory` | Makes the arbitrary constants visible, and versions any post-A0 change | No (value later) | P1 |
| **K7** | `sigma_xy`, `sigma_yaw` per LOCALIZATION §2.2, keeping `confidence` | Honest uncertainty display | Prior value only | P2 |
| **K10** | Observation store and capture (Phase B, MEMORY_DATA_MODEL) | Remembered views beyond the 32-checkpoint quota | Soft (turn trigger) | P2 |
| **K9** | `ControlSource` seam and `CalibrationController` behind `WORLDSHIFT_CALIBRATION=off`; FakeBackend tests T1/T2 (synthetic) | Phase A | **Enable: yes** | P2 (build) / after A0 (enable) |
| **K11** | Analysis worker and embeddings (Phase E groundwork) | Phase E | Partly | P3 |
| **K1** | Optional: a Codex-tested, minimal patch to the frozen `useWorldStream.ts` that forwards non-frame JSON (`navigation_update`, `checkpoint_*`, `recovery_*`) to a callback, with no change to envelope, credit or ACK behaviour | Lets the frontend stop polling | No | P3 (polling is sufficient for the MVP) |

## 5. Hand-back to Cursor

When each item lands: update API_CONTRACT.md status, add a RESULTS.md entry with test evidence, and notify
Cursor with the commit SHA. Cursor's live client then enables the corresponding field (see
[CURSOR_IMPLEMENTATION_HANDOFF.md §2](CURSOR_IMPLEMENTATION_HANDOFF.md#2-do-not-implement-yet)).
Calibration becomes live only after A0's `turn_gain_probe.json` is committed **and** K9 passes T1/T2 on
the GPU.
