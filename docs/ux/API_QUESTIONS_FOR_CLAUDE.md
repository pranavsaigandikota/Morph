# Pending API questions for Claude (spatial memory / calibration)

Frontend ships a **MOCK calibration shell** and memory gallery. Please confirm architecture before we wire LIVE.

1. **Calibration session object** — Canonical fields for planned directions (4 vs 8), capture provenance, and whether captures are Waypoint frames, SDXL stills, or client-side?
2. **Capture trigger** — Does the backend rotate the camera, or does the UI request discrete `direction` snapshots without client-side turning?
3. **Map coordinates** — Units, origin, epoch semantics, and how restore breaks continuity (`continuous: false` already used in MOCK trail)?
4. **Recovery anchors** — How should unsuitable Waypoint frames be marked server-side (`recoverySuitable` / SHA / review status)?
5. **Obstacles** — Confirm `OBSTACLE_SCHEMA_PROPOSAL.md` as the LIVE DTO; any fields still provisional?
6. **Confidence** — Which fields are real model scores vs UI placeholders? Frontend must not invent LIVE confidence.
7. **Refresh World** — Is existing `POST /world/reset` the only approved recovery path until a dedicated restore-from-image API exists?
8. **720p contract** — Any frontend-visible hello/frame fields that change when native 1280×720 is validated?

Related product doc: `docs/PRODUCT_NATIVE_720P.md`.
