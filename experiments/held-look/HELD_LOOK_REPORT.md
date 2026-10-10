# Sustained held-key look (IJKL feasibility) — native 1280×720

**Recommendation: GO, with limits.** Holding a look key (a constant mouse value per 50 ms tick) produces a
visible, direction-correct, repeatable viewpoint change that continues with longer holds. Clarity holds at
gentle–medium strength for short holds; strong or long holds (≳4–8 s) degrade into smeared vegetation,
ghosted walls or translucent structures. No angle is established: all motion figures below are inferred
image shifts, **not degrees**.

Date 2026-10-10. Branch `experiment/held-look-ijkl` (from `claude/live-memory-backend` @ `bc52c65`). Backend:
isolated native720 service :8002 (World Memory API v1.1), unchanged during the experiment. Frontend not modified;
IJKL not implemented. Archived :8000, stream protocol, Rescue/Showdown/PPO untouched.

## Method

- **Real WebSocket control path.** Node client sends `{type:'control', keys:[], mouse_dx:±S, mouse_dy:0}` every
  50 ms, acknowledges every frame. The service accumulates input per 4-frame batch exactly as for players.
  **Applied input per batch is MEASURED** from the server's own `results/<session>/batches.jsonl`.
- **Strengths** S per tick: 8 (≈ our default look), 28 (≈ our frontend's per-tick maximum), 84 (Biome-like
  brisk turn; Biome sends raw pointer pixels × default 1.8 per frame). Holds 2, 4, 8 s; right and left.
- **Trial:** `/world/reset` to the clean seed → 1 s no input → hold → 2 s no input. Every batch-last JPEG saved as
  streamed. Idle (no-input) controls per scene to separate model drift from turning.
- **Scenes:** the three A0 scenes (Florida street — human-approved; downtown city; underwater lab corridor).
- **Passes:** run 1 = staged (10 + 8 + 8 trials, incl. repeats); run 2 = full matrix, 3 scenes × (3 strengths ×
  3 durations × 2 directions + 2 idle) = 60 trials. 86 trials total, zero errors, one model load.
- **Inferred metrics** (CPU, offline): numpy-FFT phase correlation between consecutive 160×90 frames (A0 method
  family), cumulative = "pan px"; pixel change vs pre-hold frame; Laplacian-variance ratio vs pre-hold frame
  (detail retention). Visual judgements are **agent review, not human ratings**.

## Results (full matrix, run 2)

Pan at end of hold, px at 160 px width (inferred; negative = content moved left = view turned right).
Columns: Florida / City / Underwater, each `right/left`.

| Strength (per tick) | Hold | Pan R/L by scene | Min detail ratio (worst of R/L) |
|---|---|---|---|
| 8 | 2 s | −16/+13 · −17/+15 · −16/+15 | 0.80 · 0.81 · 0.90 |
| 8 | 4 s | −39/+31 · −34/+32 · −35/+30 | 0.62 · 0.71 · 0.73 |
| 8 | 8 s | −85/+73 · −82/+63 · −79/+60 | 0.45 · 0.70 · 0.36 |
| 28 | 2 s | −24/+20 · −25/+21 · −21/+27 | 0.64 · 0.70 · 0.83 |
| 28 | 4 s | −49/+46 · −60/+45 · −60/+42 | 0.57 · 0.68 · 0.71 |
| 28 | 8 s | −107/+101 · −112/+114 · −115/+107 | 0.20 · 0.59 · 0.50 |
| 84 | 2 s | −49/+50 · −57/+57 · −47/+48 | 0.66 · 0.72 · 0.93 |
| 84 | 4 s | −118/+117 · −107/+111 · −111/+95 | 0.36 · 0.69 · 0.50 |
| 84 | 8 s | −225/+234 · −227/+217 · −220/+205 | 0.27 · 0.39 · 0.37 |
| idle | 8 s | 0 · 0 · 0 (both idle controls) | 1.00 · 0.94 · 0.76 |

Answers to the seven questions:

1. **Viewpoint changes?** Yes, visibly (contact sheets), in all 54 held trials; idle controls show 0 px.
2. **Continues with longer holds?** Yes — roughly proportional to hold time at every strength (e.g. 84/tick:
   ≈50 → ≈110 → ≈225 px for 2/4/8 s). No plateau within 8 s.
3. **Consistent?** Yes. Across three scenes within ≈±10%; repeats agree (run 1 vs run 2 and in-run repeats, e.g.
   Florida 84/tick 4 s: −93, −98, −118; 84/tick 8 s: −215, −225, and −222/−221 on other scenes). Left mirrors right,
   with left slightly smaller in most cells.
4. **Recognisable?** Gentle–medium, ≤4 s: houses, roads, city blocks and corridor stay recognisable; the view
   genuinely swings toward the side. Medium 8 s: still readable but vegetation and facades soften/streak.
5. **Distortion / melt?** Strong (84) holds ≥4 s and many 8 s holds degrade: vegetation-wall takeover (Florida
   left), ghosted double walls (Florida right 8 s), translucent smeared corridor (underwater 8 s). Detail ratio
   falls to 0.2–0.4 in those cells. This matches the earlier observation that broad turns trigger drift.
6. **FPS and response delay (measured).** Genuine generated FPS 30.0–31.5 during held and zero-input batches
   alike; GPU inference ≈102 ms/batch with or without look input. Control send → first frame generated with the
   held input: p50 196 ms, p95 312 ms (client clock). Visible motion beyond idle noise: p50 ≈384 ms after that
   frame (inferred). Run 1 stage 1 showed 21–22 FPS for a while: JPEG encoding rose 32 → 84 ms for zero-input
   and held batches equally (other desktop apps competing for CPU), not caused by look input.
7. **Saturation?** No hard cap and no ignored input. Pan per unit of applied input is sub-linear at the strong
   setting (≈0.04 px/unit at 8/tick vs ≈0.02 px/unit at 84/tick, 4 s), i.e. diminishing returns per unit, but
   stronger input still turns faster and longer holds keep turning.

## Comparison with Phase A0

A0 (offline `Backend.generate`, ≤32 units/batch for 10 batches ≈ 1.4 s) measured ≈ −9 px regardless of
magnitude and concluded NO-GO for fixed-angle calibration. Our gentlest setting (≈24 units/batch) for 2 s gives
≈ −16 px — the same order. **A0 was not contradicted; its inputs were too short and too gentle to reveal the
turn.** Sustained holds of 2–8 s at realistic strengths do turn the view. A0's NO-GO on *calibrated angles*
still stands: pixels are not degrees, and no FOV is known.

## Recommendation for the product

**GO for IJKL (frontend-only mapping to `mouse_dx`/`mouse_dy`)**, with these constraints:

- Default look-key rate ≈ **8–28 per 50 ms tick** (our existing per-tick ceiling is 28). Do not exceed 28.
- Encourage **short holds**: guided calibration prompts should say "hold J/L briefly until the view faces roughly
  right" and work in ≤2–4 s holds. Keep Stability Mode's look budget active for IJKL (cumulative |dx|).
- Keep the mouse; IJKL is an alternative (accessibility, laptops, repeatable input).
- No degree labels or angle claims anywhere; the map shows soft labels only.
- Pitch (I/K) was **not tested** here (horizontal only). Map I/K to small `mouse_dy` and test before relying on it.

## Evidence

`evidence/`: contact sheets (before, hold 25/50/75/100 %, release +1 s/+2 s, with measured Σ|applied mouse| and
inferred pan) for idle and representative trials; `analysis-full-matrix.json`, `analysis-stages-1-2.json`.
All frames and server batch logs: local `C:\Users\filma\Documents\Morph\Claude\outputs\held-look-run1|run2`
(not committed; ~200 MB). Scripts: `run_held_look.mjs` (GPU, WebSocket), `analyze_held_look.py` (CPU).
Human review of the contact sheets is still recommended before shipping defaults.
