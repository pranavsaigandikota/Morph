# LIVE calibration — implementation contract

**Branch:** `cursor/calibration-user-guided-cd95`  
**Base UX commit:** `7d0ea97` (user-guided Capture View MOCK shell)  
**Codex decision:** Automatic fixed-angle calibration = **NO-GO**  
**Backend contract source:** `feature/worldshift-spatial-memory-backend` → `docs/world-memory/API_CONTRACT.md`

## Decision: reuse checkpoint APIs (no new capture routes)

| Calibration action | Existing route | Notes |
|---|---|---|
| Capture View | `POST /world/checkpoints/save` | Body `{ session_id, label? }` — last genuine engine JPEG |
| List captures | `GET /world/checkpoints?session_id=` | Authoritative list |
| Raw image | `GET /world/checkpoints/{id}/image?session_id=&variant=raw` | Durable URL; not a canvas screenshot |
| Approve / reject | `POST /world/checkpoints/{id}/review` | Body `{ session_id, approved }` — quality flags only |
| Restore clean seed | `POST /world/reset` | Same session; advances epoch; clears controls; discards stale frames |

**No new calibration-specific capture endpoints.** Frontend phase state (`world_created` → … → `complete` / `skipped` / `cancelled`) is client-local.

Out of scope / not used for post-calibration seed restore:

- `POST /world/checkpoints/restore` — restores a **checkpoint anchor**, not the original SDXL seed path required after calibration look-around.
- Enhancement / obstacle APIs — planned/proposed; not required for Capture View.

## Capture provenance (required fields)

On successful `POST /world/checkpoints/save`, the checkpoint object includes:

| Field | Meaning |
|---|---|
| Raw image | Bytes at `image_url` (`variant=raw`) — genuine Waypoint/engine frame |
| `frame_id` | Frame id at capture (`null` only for `initial_seed`) |
| `session_id` | Active world session |
| `world_id` | Memory world id |
| `epoch` | Epoch at capture |
| `image_sha256` | SHA-256 of **raw** image bytes |
| `created_at` | Capture timestamp (ISO) |
| `navigation.segment_id` | Estimated navigation segment (dead reckoning; not geography) |
| `label` | Optional user-provided **descriptive** label — not a measured angle |

Frontend maps these into `CalibrationCapture` (`src/types/calibration.ts` + `mapCheckpointCapture.ts`).

## LIVE vs MOCK boundaries

| Condition | Capture `source` | Session `source` |
|---|---|---|
| Pure UI simulation (no engine / no checkpoint routes) | `mock_ui` | `mock` |
| Engine `/health.mock === true` even if checkpoint routes work | `mock_ui` | `mock` |
| Non-mock engine + save returns `image_sha256` (64 hex) + `provenance` `raw_video_frame` or `initial_seed` | `live_waypoint` | `live` |
| Save failure | Fail closed to `mock_ui`; never launder as LIVE | `mock` |

Browser canvas screenshots are **never** accepted as LIVE provenance.

## Review persistence

- `POST .../review` sets `quality.reviewed=true` and `quality.approved=<bool>`.
- Image bytes, `image_sha256`, `frame_id`, and `provenance` are **not** modified by review.
- Retake saves a **new** checkpoint; prior evidence remains on the server. UI may replace the list slot locally.

## Labels

- Soft tags: `forward`, `right`, `behind`, `left`, `unlabeled`, …
- Sent as checkpoint `label` string.
- Backend must not treat labels as commanded camera yaw / degrees.
- Headings in the UI are user-assigned descriptive labels only.

## Restore lifecycle (`POST /world/reset`)

After calibration completes (at least one approved capture):

1. Client calls `POST /world/reset` with the calibration `session_id`.
2. Backend restores the original seed for that session.
3. **Epoch advances**; held controls clear; stale frames discarded / old-epoch rejected.
4. Client records `restoredEpoch` when the response includes `epoch`.
5. User may Begin exploration from the clean seed.

Skip / Cancel do not require restore. Skip marks `seedRestoreDone` without claiming a reset call.

## Native resolution

Product path remains **1280×720 only**. No 360p demo mode. Mock checkpoint JPEGs are native 720p.

## Explicit non-goals

- Automatic rotate-by-N-degrees calibration  
- Measured heading claims from soft labels  
- Speculative geometry / location identity  
- Presentation-queue / FPS changes (separate Codex scheduling diagnosis)  
- RescueGame / Showdown / PPO modifications  
- Merge without approval  

## Client modules

| Module | Role |
|---|---|
| `src/services/calibration/checkpointApi.ts` | REST to save/list/image/review/reset |
| `src/services/calibration/mapCheckpointCapture.ts` | Checkpoint → CalibrationCapture + LIVE gate |
| `src/services/calibration/calibrationClient.ts` | Facade: mock UI vs checkpoint_api |
| `src/services/calibration/mockCalibration.ts` | Pure UI MOCK stills |
| `server/mockCheckpoints.ts` | Contract-compatible MOCK engine routes |

## GPU acceptance (native-720p)

Authoritative GPU validation lives on the Windows host running `feature/worldshift-spatial-memory-backend` (native Waypoint 1280×720). Cloud agents without that GPU must not claim LIVE `live_waypoint` captures.

Handoff sequence on GPU host:

1. Start isolated memory backend (port per that branch; do not overwrite archived production 8000).  
2. Point Vite `VITE_WORLD_API_BASE_URL` / `/engine` proxy at that backend.  
3. Create world → `/calibrate` → Continue (starts/binds session) → Capture View → Approve → Complete & restore → Start Exploring.  
4. Confirm captures show `LIVE Waypoint`, non-null SHA, frame/session/world/epoch/segment; reset returns new epoch.

Cloud evidence in this change: MOCK engine checkpoint lifecycle (`npm run test:calibration-live`) + UI unit tests.
