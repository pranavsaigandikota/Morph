# Approximate Localization (Feature 4)

> **Revision 4 status (2026-10-10):** Phase A0 is **complete, result NO-GO** for reliable fixed-angle turning (Codex: 21 GPU trials, 3 scenes; trial report not yet published in the repo). **Guided manual calibration is approved without degree mapping** (soft labels only). Automated or fixed-angle calibration is **BLOCKED(A0 NO-GO)**, not scheduled. Canonical LIVE contract: [LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md](LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md). Source-qualified doc links: [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).

Status: **PROPOSED**. The dead reckoning in §2.1 is IMPLEMENTED today (`memory.py` `Navigation`). All
other parts are PROPOSED.

## 1. What the localizer outputs

The localizer does **not** output "the player's position". Each time an observation is analysed, it
outputs:

| Output | Class | Meaning |
|---|---|---|
| `estimated_pose` `{x, z, yaw, pitch, sigma_xy, sigma_yaw}` | ESTIMATED | Dead reckoning from applied controls, in arbitrary units, within the current segment's own frame |
| `hypothesis` ∈ {`continuing_same_area`, `entering_new_area`, `possible_revisit`, `unknown`} | INFERRED | Visual-sequence judgement about the *imagery* |
| `hypothesis_score` ∈ [0, 1] | INFERRED | Heuristic score, **not a probability** until it is calibrated against human labels (§8) |
| `revisit_candidates[]` | INFERRED | Links to earlier observations whose image **sequence** resembles the current one |
| `reasons[]` | — | Machine-readable reasons, for example `analysis_backlog`, `degraded_frames`, `post_restore_grace` |

Invariant: **visual evidence never moves the estimated pose.** A revisit candidate is drawn as a link
between two markers. The player marker is never snapped onto the old location. Revisit matching cannot
establish that two generated frames show one physical place, because no persistent place exists.

## 2. A: action-based dead reckoning

### 2.1 Existing model (IMPLEMENTED, unchanged)

Per generated batch, with applied `keys`, accumulated `mouse = (dx, dy)` and `frames = 4`:

```
yaw   += dx · 0.002            (wrapped to [-π, π))        pitch += dy · 0.002 (clamped ±π/2)
f = [w] − [s]; r = [d] − [a]; n = hypot(f, r)
if n: dt = frames/60;  x += (f·sin yaw + r·cos yaw)/n · dt;  z += (f·cos yaw − r·sin yaw)/n · dt
```

The 0.002 rad/unit and 1 unit/s constants are arbitrary. Heading 0 is +Z.

### 2.2 Proposed: explicit uncertainty instead of linear `confidence`

The existing `confidence` decays linearly and does not distinguish "turned a lot" from "walked a lot".
The proposal propagates two variances per batch. Units are estimated, and the parameters are priors to
be tuned in test T5:

```
d      = moved distance this batch (estimated units)
Δψ     = |yaw change this batch| (nominal rad)
σψ²   += (β·Δψ)² + q_ψ·[moving]·dt          β = 0.5  (turn gain unknown to ±50 %)
σxy²  += (α·d)² + (d·σψ)²                   α = 0.3  (speed scale unknown to ±30 %)
confidence (kept for API compatibility) = 1 / (1 + σxy)
```

Initial values at segment start: `σxy = 0`, `σψ = σψ0`. Use 0.35 rad if the turn gain came from the
human-reviewed A0 probe, otherwise π/2 (heading scale essentially unknown). After a restore, the segment
starts fresh in **its own frame**. Uncertainty never shrinks from visual matches.

### 2.3 Optional experimental channel: image-space yaw rate

`pan_px` (phase correlation between consecutive observations) is reported **alongside** the nominal yaw,
as `inferred_pan_px`. Its use is diagnostic: does the scene appear to rotate when we command a turn? It
is never fused into yaw, because converting pixels to degrees requires a field of view we have not
measured.

## 3. B: image-based place recognition

- **Embedding**: DINOv2-small at 224×224 (shorter-side resize plus centre crop, which keeps the 16:9 centre).
  Use the L2-normalised concatenation of CLS and mean patch tokens projected to 384-d, or simply CLS
  (choose in test T6). Store as float16. The fallback is the cached CLIP ViT-B/32 image tower.
- **Reference set** R for the current query: observations of the **same world** with `analysis_status='ready'`,
  `quality_flag='ok'`, not `near_duplicate`, and **outside the exclusion window** (same segment and within
  the last `T_excl = 20 s` or the last 8 observations). Approved observations get weight 1.0, unreviewed
  0.5, and rejected ones are excluded.
- **Retrieval**: brute-force cosine `R_emb @ q`, top-k (k=10). At ≤600×384 this takes well under 1 ms in numpy.

Single-image retrieval is **only a candidate generator**. It never produces a revisit claim by itself.

## 4. C: relative-depth cues

Depth Anything V2 Small on CPU (~1.7 s per image measured at 4 threads) is far too slow per frame. It runs
**only** on: calibration captures, `settle` observations, and the matched observations of a
sequence-level revisit candidate (for verification), within the worker's budget (GPU_RESOURCE_PLAN §3).

Output is a 3×3 grid of median **within-image relative depth rank** (0 = nearest pixel rank, 1 = farthest),
`units:"within_image_rank"`. It serves two purposes:

1. **Layout agreement** for revisit verification: Spearman correlation between the two 9-cell grids. Low
   agreement (for example, open road ahead in one frame and a wall in the other) vetoes or down-weights a
   candidate.
2. **Descriptive cue** for the UI ("view ahead appears open / appears blocked"), labelled as inferred
   from a generated frame. It is **not** used for collision or traversability.

Relative depth is never converted to metres or combined with estimated units (as OBSTACLE_SCHEMA_PROPOSAL
already requires).

## 5. D: sequence-level matching and confidence

### 5.1 Why sequences

AI-generated worlds alias heavily. A Florida-hurricane theme yields many "wet road, palm, damaged house"
frames that embed similarly. Smeared or degraded frames are also highly similar **to each other**
("blob matches blob"). A single high cosine is therefore weak evidence. A run of observations whose
similarities line up in order, with plausible heading changes, is much harder to produce by accident.

### 5.2 Sequence score (SeqSLAM-style)

Let Q be the last `L = 5` analysed, quality-ok observations of the current segment, spanning at least 4 s.
Let D be the reference set ordered by time within each segment. Build `S = Q_emb @ D_embᵀ` (L × N).
For each candidate end index *j* in D and slope *v* ∈ {0.5, 0.75, 1, 1.5, 2} (relative pace), in both the
**forward** direction and the **reverse** direction (walking back the way you came reverses order and
flips heading by ~π):

```
line(j, v, dir) = mean_i S[i, j − dir·round(v·(L−1−i))]      (indices that leave D's segment invalidate the line)
best   = max over (j, v, dir)
margin = best − median over all valid lines ending within ±W of j  (local contrast, W = 10)
```

### 5.3 Per-world normalisation (negatives from calibration)

Raw cosines vary by theme. Each world gets a **null distribution** of sequence scores from pairs that are
assumed *not* to be the same view:

- calibration captures at different intended headings (strongest available negatives within a world);
- sequences more than `T_far = 60 s` apart **and** more than `3·σxy` apart in estimated position, within one
  segment. This set is contaminated, because some of those pairs may be genuine revisits. That makes the
  threshold conservative, which is the safe direction.

`z = (best − μ_null) / σ_null`. If fewer than 20 null samples exist, revisit detection reports `unknown`
with reason `insufficient_negatives`. It does not guess.

### 5.4 Consistency checks on a candidate

| Check | Rule (initial) | Why |
|---|---|---|
| Sequence strength | `z ≥ 3.0` **and** `margin ≥ 0.05` | Beats this world's aliasing level |
| Order | ≥ 4 of 5 query observations individually in the top-10 for their aligned reference | Not one lucky frame |
| Heading consistency | Δyaw over Q vs Δyaw over the matched span: same sign for forward, opposite for reverse, within 2σψ | Controls should explain the sequence |
| Quality | No degraded frames in Q or the matched span | Blobs match blobs |
| Layout (if depth available) | Spearman(grid_q, grid_d) ≥ 0.3 on ≥ 2 aligned pairs | Coarse geometry agreement |
| Same-segment pose prior | If same segment: Mahalanobis distance of positions ≤ 3 → boost. If > 3, keep the candidate but mark `pose_inconsistent` | Dead reckoning is weak but informative within a segment |
| Cross-segment | Allowed, but it requires `z ≥ 4.0` and is always marked `cross_segment:true`; no pose prior | Segments have no geometric relation |
| Post-restore grace | Suppress candidates against the restore anchor and its own segment-of-origin for 10 s after restore | After restore the view *is* the anchor image, so it matches by construction |

`hypothesis_score` for a candidate = `sigmoid(a·(z − 3) + b·margin + c·layout)`, with
`a, b, c` hand-set in the MVP and fitted to human labels in test T6. It is shown as
"match strength", never as "% probability you are here".

## 6. E: hypothesis state

A 4-state filter with hysteresis, updated per analysed observation. The MVP uses rules. Phase C+ can
replace them with an HMM whose emission probabilities are fitted to human labels.

| Evidence | Computed from |
|---|---|
| `recent_sim` | mean cosine of the current observation to the last 3 observations in the same segment |
| `novelty` | 1 − max weighted cosine to R (outside the exclusion window) |
| `revisit` | best candidate passing §5.4 |
| `blocked` | analysis backlog > 4, current frame degraded, post-restore grace, or <20 null samples |

```
if blocked:                                   unknown (reason)
elif revisit and score ≥ θ_rev for 2 consecutive updates:   possible_revisit
elif recent_sim ≥ θ_cont:                     continuing_same_area
elif novelty ≥ θ_new for 2 consecutive updates:             entering_new_area
else:                                         keep the previous state (hysteresis), score decays ×0.8
```

Initial thresholds: `θ_cont` = the 25th percentile of the calibration return-check cosines, `θ_new` = the
95th percentile of the null distribution mapped to novelty, and `θ_rev = 0.6`. Test T6 tunes them.

## 7. Pseudocode

### 7.1 Memory retrieval

```python
class MemoryIndex:
    """Per-world, in-RAM mirror of observation embeddings. Rebuilt from SQLite at world load."""
    def __init__(s):
        s.ids, s.emb, s.meta = [], np.zeros((0, 384), np.float16), []

    def add(s, obs):
        if obs.analysis_status != 'ready' or obs.quality_flag != 'ok' or obs.is_near_duplicate or obs.approved is False:
            return
        s.ids.append(obs.id); s.meta.append(obs.slim()); s.emb = np.vstack([s.emb, obs.embedding[None]])

    def reference_mask(s, query, cfg):
        m = np.ones(len(s.ids), bool)
        for i, o in enumerate(s.meta):
            same_seg = o.segment_id == query.segment_id
            if same_seg and (query.t - o.t < cfg.T_excl or o.rank_in_segment > query.rank_in_segment - 8):
                m[i] = False                                # temporal neighbourhood is not a "revisit"
            if o.world_id != query.world_id:
                m[i] = False                                # never cross worlds
            if query.post_restore_grace and (o.id == query.restore_anchor_obs or o.segment_id == query.restored_from_segment):
                m[i] = False
        return m

    def topk(s, q_emb, mask, k=10):
        sims = (s.emb.astype(np.float32) @ q_emb.astype(np.float32))
        weights = np.array([1.0 if o.approved else 0.5 for o in s.meta], np.float32)
        sims = np.where(mask, sims * weights, -np.inf)
        idx = np.argpartition(-sims, min(k, len(sims) - 1))[:k]
        return sorted(((s.ids[i], float(sims[i])) for i in idx if np.isfinite(sims[i])), key=lambda t: -t[1])
```

### 7.2 Approximate location prediction

```python
class Localizer:
    def on_observation_analysed(s, obs):
        if obs.epoch != s.world.epoch:
            return                                           # evidence stored, but no live update
        s.index.add(obs)
        s.recent[obs.segment_id].append(obs)
        pose = obs.estimated_pose                            # ESTIMATED, unchanged by anything below

        reasons = s.blocking_reasons(obs)                    # backlog, degraded, grace, few negatives
        Q = [o for o in s.recent[obs.segment_id][-5:] if o.quality_flag == 'ok']
        candidate = None
        if not reasons and len(Q) == 5 and Q[-1].t - Q[0].t >= 4.0:
            mask = s.index.reference_mask(obs, s.cfg)
            seeds = {rid for o in Q for rid, _ in s.index.topk(o.embedding, mask)}
            candidate = s.best_sequence(Q, seeds, mask)      # §5.2 lines, both directions, slopes
            if candidate:
                candidate.z = (candidate.best - s.null.mu) / s.null.sigma
                candidate.checks = s.consistency_checks(Q, candidate, pose)   # §5.4 table
                if candidate.needs_depth and s.worker.depth_budget_available():
                    s.worker.request_depth(candidate.aligned_obs_ids)         # async; re-evaluated on return
                candidate.score = sigmoid(s.a*(candidate.z - 3) + s.b*candidate.margin + s.c*candidate.layout)
                if not candidate.checks.passed:
                    candidate = None

        recent_sim = mean(cos(obs.embedding, o.embedding) for o in s.recent[obs.segment_id][-4:-1])
        novelty = 1 - (max(sim for _, sim in s.index.topk(obs.embedding, s.index.reference_mask(obs, s.cfg), 1)) if s.index.ids else 0)
        state, score = s.hysteresis.update(reasons, candidate, recent_sim, novelty)   # §6

        if candidate and state == 'possible_revisit':
            s.store.add_link(obs.id, candidate.matched_end_id, 'revisit_candidate', candidate.score, candidate.detail())
            s.emit('revisit_candidate', candidate.public())
        s.emit('localization_update', {
            'observation_id': obs.id, 'segment_id': obs.segment_id, 'epoch': obs.epoch,
            'estimated_pose': {**pose, 'evidence': 'estimated', 'units': 'estimated_units'},
            'hypothesis': state, 'hypothesis_score': score, 'score_kind': 'heuristic_uncalibrated',
            'reasons': reasons, 'evidence': 'inferred'})
```

## 8. Turning scores into honest confidence

1. MVP: scores are labelled `heuristic_uncalibrated`.
2. After test T6 human labelling (≥300 candidate pairs across ≥3 scenes), fit Platt scaling of the score
   against the human "same place" label (≥4 on a 1–5 scale). Relabel the result `calibrated_to_human_judgement`.
   That is still a calibration to **what humans judge as the same place in generated video**, not to
   physical truth.
3. Report precision and recall with confidence intervals per scene. Precision is the priority: a missed
   revisit is acceptable, a false one is not.

## 9. Known failure modes

| Failure | Mitigation | Residual |
|---|---|---|
| Theme aliasing (all roads look alike) | Sequence matching, per-world null, z-threshold, cross-world disabled | Some aliasing will pass. Precision is measured, not assumed |
| Degraded-frame matching | Exclude degraded frames from Q and R | The degradation flag itself is imperfect |
| Seed restore matches seed by construction | Post-restore grace | — |
| Waypoint regenerates a "returned-to" place differently | None possible. A miss is reported as `entering_new_area` | Inherent: no persistent world |
| Turn gain unknown | A0 probe, large σψ prior | Heading-consistency check is weak |
| Analysis backlog | `unknown` with reason; no stale predictions | — |
