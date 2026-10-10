# Initial Look-Around Calibration (Feature 1)

> **Revision 4 status (2026-10-10):** Phase A0 is **complete, result NO-GO** for reliable fixed-angle turning (Codex: 21 GPU trials, 3 scenes; trial report not yet published in the repo). **Guided manual calibration is approved without degree mapping** (soft labels only). Automated or fixed-angle calibration is **BLOCKED(A0 NO-GO)**, not scheduled. Canonical LIVE contract: [LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md](LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md). Source-qualified doc links: [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

Status: **PROPOSED**. Nothing here is implemented. Read the evidence classes in
[VISUAL_SPATIAL_MEMORY_ARCHITECTURE.md §2](VISUAL_SPATIAL_MEMORY_ARCHITECTURE.md) first.

## 1. What calibration is, and what it is not

Calibration is a **guided visual survey from the starting seed**. It produces:

- a small, human-reviewable set of genuine Waypoint frames at **intended** headings;
- a per-world **reference set** (seed plus accepted views) used for revisit detection and degradation baselines;
- per-world **statistics** (quality baselines, a "different-heading" similarity distribution used as negatives);
- a measurement of **how much Waypoint drifts during a turn-and-return** for this scene.

It does **not** produce calibrated camera poses, a 360° panorama, a measured FOV or a measured
mouse-to-degree mapping. Frames are never stitched.

## 2. Facts from the current code that constrain the design

| Fact (verified in `service.py` / `memory.py` / `backend.py`) | Consequence |
|---|---|
| Mouse deltas are passed unscaled into `CtrlInput(mouse=(dx,dy))`. Waypoint's expected magnitude is undocumented here | **We do not know how many mouse units make 45°.** |
| Existing backend tests send `mouse_dx` ≈ 0.5–1 per 50 ms message (≈1.5–3 units per batch). The frontend's look control sends up to 28 per tick (≈84 per batch) and Stability Mode resets at 320 cumulative units (revision 2) | The tested backend range and the real player range differ by an order of magnitude |
| `Navigation` uses `0.002 rad/unit`, an arbitrary constant | Nominal 45° = 392.7 units, far outside the tested range. The nominal yaw and the visual yaw are **unrelated until probed** |
| Accumulated mouse per batch is clamped to ±1000. Controls are zeroed if no control arrives for 0.5 s | A controller must feed a control every batch |
| One batch = 4 frames, ~138–145 ms at 720p | A turn of *n* micro-steps takes ≈ *n* × 0.14 s |
| Generation runs only while `status=='running'` **and** a subscriber is connected | Calibration needs the player's stream open. That is good UX: the player watches the look-around |
| `/world/reset` restores the original seed, increments epoch, repositions to checkpoint 0 (GPU-tested) | Safe, tested exit path |

## 3. Phase A0: turn-gain probe (one-off experiment, not per session)

Before calibration can aim at "45°", we need an **empirically chosen** mouse amount. Run per model build
and quantisation setting, on ≥3 distinct scenes:

1. Start from a seed. For each candidate per-batch magnitude `m ∈ {1, 2, 4, 8, 16, 32, 64, 84}`:
   reset to seed, then apply `mouse_dx = m` for `K = 10` batches, then 4 zero-input batches.
   *Revision 2:* the range now covers the frontend's real operating range. `lookControl.ts` allows up to
   28 units per 50 ms tick (≈84 per batch), and Stability Mode resets after 320 cumulative units. The full
   refined protocol (sweeps S1–S4, output artifact) is in
   [CODEX_CALIBRATION_HANDOFF.md](CODEX_CALIBRATION_HANDOFF.md).
2. Per batch, record (MEASURED) the applied mouse and JPEG, and (INFERRED) the horizontal image pan from
   numpy-FFT phase correlation on 160×90 grayscale centre strips of consecutive batch-last frames, plus
   quality indicators.
3. Render a contact sheet per `m`. A **human** marks, for each `m`, roughly how far the view turned
   (`<15°`, `~30°`, `~45°`, `~90°`, `>90°`, `unclear/degraded`).
4. Choose `units_per_intended_45deg` and a per-batch step that keeps quality acceptable. Store it in
   config with `source: "human_estimate_from_probe"`, the probe report path and the reviewer.

If no magnitude produces a recognisable turn without degradation, use the **small-arc** strategy (§4).
Never claim any degree mapping beyond this estimate.

Optional experimental extension (**turn-closure probe**): keep turning in one direction while tracking
similarity to the start view. In a persistent world, a similarity peak would mark 360°. In Waypoint a
peak may be coincidental or absent. Record it as INFERRED with low confidence. Never use it to correct yaw
automatically.

## 4. Calibration strategies

All strategies use **out-and-back** turns, so the view returns to forward between sides. This bounds
continuous rotation exposure and gives a built-in drift check (the return view against the original
forward view). Continuous 360° rotation is kept only as a drift *experiment*.

| Mode | Sequence of intended headings (capture ●, return-check ◆) | Turn exposure | Use |
|---|---|---|---|
| `four_out_and_back` **(MVP default)** | ●0 → ●90 → ◆0 → ●270 → ◆0 | 4×90° | Default. Behind (180°) omitted |
| `four_with_behind` | ●0 → ●90 → ●180 → ◆0 (via 90) → ●270 → ◆0 | 6×90° | If T2 tests show acceptable drift |
| `eight_out_and_back` | ●0 → ●45 → ●90 → ●135 → ●180 → ◆0 (reverse) → ●315 → ●270 → ●225 → ◆0 | 16×45° | Only if drift tests pass on ≥3 scenes |
| `small_arc` (fallback) | ●0 → ●30 → ◆0 → ●330 → ◆0 | 4×30° | When turns degrade quickly |
| `eight_continuous` (experiment only) | ●0 → ●45 → … → ●315 → ◆360 | 8×45° | Drift measurement in tests T2; never for players |

"Behind" via a return path is the riskiest view. It is reached last on its side and is the furthest from
the seed in generation steps. The MVP omits it until test T2 says otherwise.

## 5. Per-heading procedure

For each target heading:

1. **Turn**: split the needed mouse amount into micro-steps of `step_units` per batch (from the A0 probe).
   Feed one micro-step per batch through the server-side `ControlSource` (§7). Keys stay empty: no
   translation during calibration.
2. **Settle**: zero input for at least `settle_min_batches = 3`. Then continue until the frame-to-frame
   instability (mean absolute difference of 160×90 grayscale batch-last frames, /255) is below
   `settle_tau = 0.02` for 2 consecutive batches, or `settle_max_batches = 8` is reached. Settling is not
   free: an idle Waypoint keeps generating and can itself drift. Hitting the max is recorded as
   `settle_status:"timeout"`.
3. **Capture**: take the batch-last JPEG bytes exactly as streamed (MEASURED). Compute SHA-256 and record
   `frame_id`, `epoch`, `session_id`, the full applied per-batch control list, and `intended_yaw_deg`.
   Also record the nominal yaw (the `Navigation` estimate) and `pan_px_integrated` (INFERRED, the sum of
   phase-correlation pans during the turn).
4. **Analyse** asynchronously in the worker: quality indicators, dHash, DINOv2 embedding and an
   optional Depth Anything 3×3 layout grid.
5. **Check** (§6). A failed check marks the observation and may abort the sequence.
6. **Store** as an observation with `capture_reason:"calibration"` (MEMORY_DATA_MODEL.md).

## 6. Consistency checks and safe failure

All thresholds are config values with **initial guesses**. Test T2 replaces them with values fitted to
human labels. None of them proves spatial consistency.

| Check | Signal (class) | Initial rule | On failure |
|---|---|---|---|
| Frame valid | `inspect_image` (MEASURED stats) | not `invalid_uniform` | abort `aborted_quality` |
| Quality held | Laplacian var and luma std vs the seed's values (INFERRED) | ≥ 0.5 × seed | flag view `degraded`. If 2 views are degraded, abort |
| Turn took effect | dHash Hamming(view, previous) ≥ 12 **and** \|pan_px_integrated\| ≥ 0.1 × width | both | flag `turn_ineffective`. If the first turn fails, abort `aborted_turn_ineffective` (the probe gain is wrong) |
| Turn direction plausible | sign(pan_px) consistent with the commanded direction | consistent | flag `direction_inconsistent` (not abort: pan is weak evidence) |
| Return consistency ◆ | cosine(DINOv2(return), DINOv2(forward₀)) and dHash(return, forward₀) | cos ≥ `ret_ok` (init 0.80) → `ok`; ≥ `ret_mild` (0.65) → `mild_drift`; else `severe_drift` | `severe_drift` → abort the remaining sides `aborted_drift`. Downgrade the mode for the next session (8 → 4 → small_arc) |
| Distinctness | cosine between different-heading views | recorded, not judged | feeds the per-world negative distribution (LOCALIZATION §5.3) |

**Safe exit, always:** whatever the outcome, calibration ends with the existing tested `/world/reset`
path back to the original seed. That gives a new epoch and a new segment with `anchor.kind:"reset_to_seed"`.
Exploration therefore never begins from a view that calibration itself may have degraded. All
calibration observations are kept as evidence with their status. Calibration is optional: on
abort, the player still explores normally, and place recognition falls back to the seed alone as its
reference set.

Outcomes: `completed`, `completed_with_flags`, `aborted_drift`, `aborted_quality`,
`aborted_turn_ineffective`, `cancelled` (user or disconnect), `error`.

## 7. Integration seam: ControlSource

Today `run()` reads `self.keys/self.mouse` directly. The minimal proposed change is a single seam:

```python
# service.py run(), replacing the two lines that read keys/mouse:
keys, mouse, origin = self.control_source.next_batch_controls()   # origin: 'player' | 'calibration'
```

`PlayerControlSource` reproduces today's behaviour exactly, including the 0.5 s timeout and accumulator
reset. `CalibrationControlSource` yields scripted micro-steps. While calibration is active, client
`control` messages get `{type:"error", message:"Calibration in progress"}` (the same pattern as the
existing non-controller error). They are not applied. `origin` is written to `batches.jsonl` so evidence
shows which batches were scripted.

## 8. Pseudocode: calibration controller

```python
MODES = {
  'four_out_and_back': [(0,'capture'),(90,'capture'),(0,'return'),(-90,'capture'),(0,'return')],
  'small_arc':         [(0,'capture'),(30,'capture'),(0,'return'),(-30,'capture'),(0,'return')],
  # ... others as in §4; negative = left, normalised to 0..360 when recorded
}

class CalibrationController:
    def __init__(s, svc, memory, cfg):
        s.svc, s.mem, s.cfg = svc, memory, cfg
        s.units_per_deg = cfg.units_per_intended_45deg / 45.0     # from the A0 probe; human estimate
        s.step = cfg.step_units                                    # per-batch micro-step
        s.state = 'idle'

    async def run(s, session_id, mode):
        world = s.mem.find(session_id); epoch0 = s.svc.epoch
        run = s.mem.calibration_begin(world, mode)                 # persists a calibration_run row
        s.svc.control_source = CalibrationControlSource()
        current = 0.0; forward_ref = None
        try:
            for target, kind in MODES[mode]:
                s.guard(session_id, epoch0)                        # stop/reset/restore/disconnect → CalibrationCancelled
                await s.turn(target - current); current = target
                settle = await s.settle()
                obs = await s.capture(run, target, kind, settle)   # raw bytes + sha now; analysis async
                res = await s.mem.wait_analysis(obs.id, timeout=5) # bounded wait, off the stream path
                verdict = s.check(obs, res, forward_ref, kind)
                s.mem.calibration_record(run, obs, verdict)
                s.mem.emit('calibration_progress', {...})
                if kind == 'capture' and target == 0 and forward_ref is None:
                    forward_ref = res
                if verdict.abort:
                    return s.finish(run, verdict.outcome)
            return s.finish(run, 'completed_with_flags' if run.flags else 'completed')
        except CalibrationCancelled:
            return s.finish(run, 'cancelled')
        except Exception as e:
            return s.finish(run, 'error', error=str(e))
        finally:
            s.svc.control_source = PlayerControlSource()
            await s.svc.action(session_id, 'reset')                # existing tested path → seed, new epoch/segment

    async def turn(s, delta_deg):
        remaining = delta_deg * s.units_per_deg
        while abs(remaining) > 1e-6:
            u = copysign(min(s.step, abs(remaining)), remaining)
            await s.svc.control_source.push_and_wait_batch(keys=[], mouse=(u, 0.0))  # one batch consumes it
            remaining -= u

    async def settle(s):
        prev, stable, n = None, 0, 0
        while n < s.cfg.settle_max_batches:
            frame = await s.svc.control_source.push_and_wait_batch(keys=[], mouse=(0, 0))
            g = gray_160x90(frame.jpeg)                            # small decode in to_thread
            if prev is not None:
                instability = mean_abs(g - prev) / 255
                stable = stable + 1 if instability < s.cfg.settle_tau else 0
            prev, n = g, n + 1
            if n >= s.cfg.settle_min_batches and stable >= 2:
                return {'status': 'stable', 'batches': n}
        return {'status': 'timeout', 'batches': n}
```

## 9. Human review step

After a calibration run, the UI shows a review strip: each capture's raw thumbnail, its intended heading
(labelled "intended"), its flags, and the two return checks shown side by side with forward₀.
The reviewer marks each view **accept** or **reject**. Optionally the reviewer marks "the return view shows
the same place as forward" on a 1–5 scale. Only accepted views join the world's approved reference set.
Unreviewed views can still be used for retrieval, but with an `unreviewed` flag that halves their weight
in revisit scoring (LOCALIZATION §5).

## 10. Calibration API (additive, PROPOSED)

| Method / path | Body / query | Response |
|---|---|---|
| `POST /world/calibration/start` | `{session_id, mode?:'four_out_and_back'}` | `202 {calibration_id, status:'running'}`. Returns `409` if one is active, a lifecycle lock is held, or the world is not running |
| `GET /world/calibration?session_id=S` | — | Calibration run object (MEMORY_DATA_MODEL §3.3) |
| `POST /world/calibration/cancel` | `{session_id}` | `{status:'cancelled'}`; the safe exit still resets to seed |
| `POST /world/observations/{id}/review` | `{session_id, approved, same_place_score?}` | Updated observation |
