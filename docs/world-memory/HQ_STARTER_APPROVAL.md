# HQ SDXL starter approval (before Waypoint)

**Priority:** semantically sensible visuals. Buildings must look like buildings; roads like roads; vegetation like vegetation. Sharp blobs are not acceptable.

Product Waypoint resolution is **native 1280×720 only** ([PRODUCT_NATIVE_720P.md](../PRODUCT_NATIVE_720P.md)). HQ starters match that size; there is no 360p product path.

## Policy

| Rule | Status |
|------|--------|
| Generate multiple deterministic HQ seeds (default 6) | Required |
| Target **1280×720**, **~30 steps**, `quality:"high"` | Experimental API |
| Human approval of contact sheet before Waypoint | Required |
| Preserve original image, prompt, seed, settings, SHA-256 | Required |
| Early / blurry Waypoint checkpoints as recovery anchors | **Rejected** |
| Silent Turbo relabel as HQ | **Forbidden** |
| Fake video frames / silent model switch | **Forbidden** |
| Physical location continuity across regenerations | **Never claimed** |

Verified SCENE_API Turbo is steps **1–4** @ ~640×384 only. Cloud agents cannot reach `:8000` GPU — run HQ generation on Windows.

## UI path

1. Open `/create`
2. Enter the **original scene prompt/theme** (composition guide is appended for first-person depth only)
3. **Generate HQ candidates**
4. Review the contact sheet — Approve one coherent starter, Reject the rest
5. **Enter world with approved starter** only after approval
6. Turbo generate remains available as a secondary verified path (≤4 steps) — not an HQ approval candidate

Rejected early Waypoint frames appear in Explorer with **Not a recovery anchor** and Restore disabled.

## Windows: generate contact sheet

```powershell
# Backend already on http://127.0.0.1:8000 (do not relaunch if healthy)
cd <WorldShift-clone>
git checkout feature/worldshift-visual-memory-ui
git pull
npm.cmd ci

# Optional CLI batch → writes candidates under work/hq-starters/
.\scripts\Generate-HqStarterContactSheet.ps1 `
  -Prompt "Your original scene prompt here" `
  -Style cinematic

# Or use the Create UI after:
npm.cmd run dev
# → http://127.0.0.1:4821/create → Generate HQ candidates → approve one
```

Script defaults: six seeds `202610101`…`202610106`, 1280×720, 30 steps, first-person composition guide. Output JSON includes `image_sha256`, seed, steps, model, revision.

If the experimental HIGH body is rejected (422), the script fails honestly — it will **not** fall back to Turbo and label the result HQ.

## After approval — comparisons (Windows GPU)

Continue these comparisons only from an **approved** HQ starter:

1. **Original-seed** (approved HQ) vs previous starter — same movement pattern
2. **Fresh-SDXL** transition (new theme-consistent HQ image via scene-start) — not a degraded Waypoint still
3. **No-recovery** — do not reuse rejected early Waypoint checkpoints

For each of ≥3 successive transitions, record: visual coherence, latency, Gen/Disp FPS, memory, session/epoch correctness.

See `STARTER_COMPARISON_STATUS.md`.

## Recovery when Waypoint degrades

1. Mark the blurry/nonsensical checkpoint unsuitable (UI does this for early Waypoint frames)
2. Do **not** restore from it
3. Transition via verified **scene-start** or restoration from an **approved SDXL** still only
4. Do not claim physical continuity

## Reproducibility fields

Keep for every approved starter:

- `prompt` / effective first-person prompt
- `style`
- `generationSeed`
- `steps`, `width`, `height`, `quality`
- `model`, `revision`
- `image_sha256`
- `scene_id` / `world_start_request`
