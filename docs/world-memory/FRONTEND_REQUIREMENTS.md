# Frontend requirements for Codex (World Memory)

Cursor branch: `feature/worldshift-visual-memory-ui`  
Explorer needs these capabilities for full (non-mock) integration. Paths/events are **suggestions** until Codex publishes `API_CONTRACT.md`.

## Must have

1. **Session navigation estimate** (throttled, e.g. 5–10 Hz)  
   - Estimated `x`, `y` in an arbitrary session frame  
   - Estimated `heading_deg` (0–360 in that frame)  
   - Optional uncertainty  
   - Generation `epoch`  
   - Clear that this is **not** geographic north / verified 3D pose

2. **Checkpoint capture**  
   - Manual “Save View”  
   - Optional automatic captures  
   - Returns: `checkpoint_id`, JPEG or URL, timestamp, optional pose/heading, `epoch`

3. **Restore viewpoint**  
   - Explicit action: reinitialize generation from a checkpoint image  
   - Progress / failure events  
   - New `epoch` after restore  
   - Same `session_id` preferred (or documented replacement)

4. **Honest semantics**  
   - Restore is a generation transition, not physical travel  
   - Trail may be discontinuous across restores

## Nice to have

- Enhanced still (queued / ready) with raw vs enhanced URLs  
- Trail segment markers when continuity is unknown  
- High Quality world-create mode distinct from Turbo presets

## Non-negotiables for Cursor

- Do not break existing `/world/stream` + `display_ack` credit window  
- Do not invent conflicting physics on the client when live estimates exist  
- Rescue Mission / Showdown / SDXL contracts stay separate
