# Pending API questions for Claude (spatial memory / calibration)

Frontend ships a **MOCK user-guided calibration shell** and memory gallery. Codex: automatic fixed-angle calibration is **NO-GO**. Confirm architecture before LIVE wiring. See also `CALIBRATION_API_REQUIREMENTS.md`.

1. **Capture current view** — Endpoint / event that returns the active session’s genuine Waypoint raw frame + SHA (not browser screenshot)?
2. **Session lifecycle** — create → scan → capture* → approve/reject/retake → **restore seed** → complete | skip | cancel?
3. **Optional labels** — Soft tags only; confirm backend never treats them as commanded yaw?
4. **Seed restore** — Is `POST /world/reset` the approved post-calibration clean-seed path?
5. **Map coordinates** — Units, origin, epoch; restore trail discontinuity?
6. **Recovery anchors** — Server-side `recoverySuitable` / SHA / review?
7. **Obstacles** — Confirm `OBSTACLE_SCHEMA_PROPOSAL.md` as LIVE DTO?
8. **Confidence** — Which scores are real vs must stay null on client?
9. **720p contract** — Hello/frame fields when native 1280×720 is the validated product path?

Related: `docs/PRODUCT_NATIVE_720P.md`.
