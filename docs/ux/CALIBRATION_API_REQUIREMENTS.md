# Outstanding API requirements — user-guided calibration

**Branch:** `cursor/calibration-user-guided-cd95`  
**Accepted frontend tip:** `7d0ea97` (user-guided Capture View MOCK shell)  
**Codex decision:** Automatic fixed-angle calibration = **NO-GO**.

Frontend MOCK shell at `7d0ea97` is the accepted UI direction. Preserve it. Do **not** invent Capture View endpoints. Do **not** add new calibration UI features until Codex publishes a verified LIVE contract.

## Current posture

| Item | Status |
|---|---|
| User-guided Capture View UI (`7d0ea97`) | **Accepted — preserve** |
| Invented capture routes | **Forbidden** |
| LIVE labeling of captures | **Forbidden** until genuine Waypoint frame + SHA-256 work end to end |
| Adapter wiring | **Wait** for Codex verified LIVE calibration contract |
| Checkpoint API reuse investigation | **Codex-owned** |
| Presentation queue / Rescue / Showdown / PPO | **Unchanged** |

## Required for LIVE wiring (Codex publishes; then minimal adapter)

1. **Capture current view**  
   - Prefer reusing existing spatial-memory checkpoint APIs if Codex verifies them for this use.  
   - Must return the **current genuine Waypoint raw frame** (or durable URL) + `image_sha256`.  
   - Must **not** require the browser to screenshot the canvas as provenance.  
   - No new Capture View endpoints without Codex approval.

2. **Approve / reject**  
   - Persisted review that does not mutate image evidence.

3. **Restore original seed**  
   - Existing `POST /world/reset` if Codex documents it as the post-calibration path.

4. **Optional soft labels**  
   - User-assigned descriptive tags only — not measured yaw / commanded angles.

5. **Provenance**  
   - `source: live_waypoint` only after end-to-end genuine Waypoint + SHA verification.  
   - Until then every capture stays `mock_ui` / MOCK-labeled.

6. **Presentation queue**  
   - Leave unchanged pending Codex browser scheduling diagnosis (separate workstream).

## Explicitly out of scope right now

- New Capture View endpoints  
- New calibration UI features  
- Automatic rotate-by-N-degrees  
- Browser screenshot → “LIVE frame” laundering  
- Premature LIVE adapter before Codex contract  
- Changes to RescueGame, Showdown, or PPO data  

## Related

- `docs/ux/INTEGRATION_CHECKLIST.md`  
- `docs/ux/API_QUESTIONS_FOR_CLAUDE.md`  
- `docs/PRODUCT_NATIVE_720P.md`  
