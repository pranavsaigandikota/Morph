# Starter comparison status

Cloud has **no** access to production `:8000` GPU. Candidate images and movement comparisons must be produced on Windows with the experimental HQ SDXL path. Do not invent contact-sheet PNGs here.

## Recovery anchor decision

| Artifact | Verdict |
|----------|---------|
| Early Waypoint checkpoint (blurry / nonsensical) | **REJECTED** — unsuitable recovery anchor |
| Turbo ≤4-step seed labeled as HQ | **Forbidden** |
| Approved HQ SDXL 1280×720 ~30-step starter | **Required** before Waypoint recovery demos |

## Comparison matrix (run on Windows after HQ approval)

| Run | Starter | Movement pattern | Visual coherence | Latency | Gen FPS | Disp FPS | Memory | Session/epoch | Notes |
|-----|---------|------------------|------------------|---------|---------|----------|--------|---------------|-------|
| A | Previous starter (pre-HQ) | WASD forward + look circle | _pending GPU_ | | | | | | Baseline |
| B | Approved HQ SDXL (original seed) | Same as A | _pending approval_ | | | | | | Primary |
| C | Fresh theme-consistent HQ SDXL | Same as A after scene-start | _pending_ | | | | | | New clean image — not continuity |
| D | No-recovery (rejected early WP unused) | Same as A; restore blocked | Policy enforced in UI | n/a | | | | | Must not restore from rejected frame |

## Transition test (≥3 successive)

Use **only** verified scene-start or restoration from approved SDXL / suitable anchors:

1. Approved HQ → explore → stop → fresh HQ scene-start (theme-consistent)
2. Fresh HQ → explore → restore from **Start** (sdxl_starter) only
3. Optional third: another HQ scene-start — never early Waypoint still

Record epoch bumps on restore; trail `continuous: false` across restore. Do not claim physical location continuity.

## Blockers

- Experimental `quality:"high"` / 1280×720 / steps≈30 must be accepted by Codex backend
- Human visual approval of contact sheet (no auto-approve)
- Production backend port **8000**, verified release, RescueGame — unchanged
