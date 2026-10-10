# Outstanding API requirements — user-guided calibration

**Branch:** `cursor/calibration-user-guided-cd95`  
**Codex decision:** Automatic fixed-angle calibration = **NO-GO**.

Frontend MOCK shell implements user-guided Capture View with approve / reject / retake, optional soft labels, Skip / Cancel, and a MOCK “restore clean seed” step. Do not invent endpoints to match the shell.

## Required for LIVE wiring

1. **Capture current view**  
   - Authenticated call that returns the **current genuine Waypoint raw frame** (or durable URL) for the active session.  
   - Must include `image_sha256` of original bytes.  
   - Must **not** require the browser to screenshot the canvas as provenance.

2. **Session lifecycle events**  
   - create / skip / cancel / complete  
   - capture added / retaken / approved / rejected  
   - Explicit **restore original seed** before explore (existing `POST /world/reset` acceptable if documented).

3. **Optional soft labels**  
   - User-assigned tags (`forward`, `right`, …, `unlabeled`) with no claim of measured yaw.  
   - Backend must not treat labels as commanded camera angles.

4. **Provenance**  
   - `source: live_waypoint` only when the capture API succeeds.  
   - MOCK / UI simulations stay `mock_ui`.

5. **Presentation queue**  
   - Leave the validated client presentation queue unchanged until Codex finishes browser scheduling diagnosis.  
   - Do not ship claims that a four-frame queue improved FPS.

## Explicitly out of scope

- Automatic rotate-by-N-degrees calibration  
- Hardcoded camera angles in the frontend  
- Browser screenshot → “LIVE frame” laundering  
- New undocumented capture routes without Claude/Codex approval  

## Related

- `docs/ux/INTEGRATION_CHECKLIST.md`  
- `docs/ux/API_QUESTIONS_FOR_CLAUDE.md`  
- `docs/PRODUCT_NATIVE_720P.md`  
