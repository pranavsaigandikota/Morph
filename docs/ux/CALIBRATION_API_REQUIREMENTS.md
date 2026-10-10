# Calibration API requirements — status

**Branch:** `cursor/calibration-user-guided-cd95`  
**Codex decision:** Automatic fixed-angle calibration = **NO-GO**.

Authoritative LIVE wiring contract: **`docs/ux/CALIBRATION_LIVE_CONTRACT.md`**.

## Resolved by reusing spatial-memory checkpoints

| Requirement | Resolution |
|---|---|
| Capture current genuine Waypoint frame + SHA | `POST /world/checkpoints/save` + `GET .../image?variant=raw` |
| Session lifecycle create/skip/cancel/complete | Client-local phases; no new routes |
| Approve / reject / retake | `POST .../review`; retake = new save |
| Restore original seed before explore | `POST /world/reset` |
| Optional soft labels | Checkpoint `label` — not measured yaw |
| Provenance `live_waypoint` vs `mock_ui` | Gated in `mapCheckpointCapture.ts` |

## Still out of scope

- Automatic rotate-by-N-degrees calibration  
- Browser screenshot → LIVE frame laundering  
- New undocumented capture routes  
- Presentation queue / FPS claims (separate scheduling diagnosis)

## Related

- `docs/ux/CALIBRATION_LIVE_CONTRACT.md`  
- `docs/ux/INTEGRATION_CHECKLIST.md`  
- `docs/world-memory/API_CONTRACT.md` (backend; spatial-memory branch)  
- `docs/PRODUCT_NATIVE_720P.md`  
