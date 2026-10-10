# Pending API questions — waiting on Codex LIVE contract

Accepted frontend: user-guided calibration MOCK shell @ `7d0ea97` on `cursor/calibration-user-guided-cd95`.

Codex owns investigation of reusing spatial-memory checkpoint APIs. Frontend will apply **minimal adapter changes only after** a verified LIVE calibration contract is published. Until then: no invented Capture View endpoints; all captures stay MOCK-labeled.

See also `CALIBRATION_API_REQUIREMENTS.md`.

1. **Capture current view** — Can existing `POST /world/checkpoints/save` (+ raw image) supply genuine Waypoint frames + SHA for Capture View, or does Codex require another verified path?
2. **Approve / reject** — Does `POST /world/checkpoints/{id}/review` persist review without mutating image evidence?
3. **Seed restore** — Is `POST /world/reset` the approved post-calibration clean-seed path (epoch / controls / stale frames)?
4. **Optional labels** — Soft tags only; confirm backend never treats them as commanded yaw.
5. **LIVE gate** — Exact fields required before client may set `source: live_waypoint`.
6. **Map coordinates** — Units, origin, epoch; restore trail discontinuity?
7. **Obstacles** — Confirm `OBSTACLE_SCHEMA_PROPOSAL.md` as LIVE DTO? (out of calibration adapter scope)
8. **720p contract** — Hello/frame fields when native 1280×720 is the validated product path?

Related: `docs/PRODUCT_NATIVE_720P.md`.
