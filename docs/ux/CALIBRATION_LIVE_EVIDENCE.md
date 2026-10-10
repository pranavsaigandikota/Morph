# Calibration LIVE wiring — integration evidence

**Branch:** `cursor/calibration-user-guided-cd95`  
**Contract:** `docs/ux/CALIBRATION_LIVE_CONTRACT.md`

## What was decided

Capture View **reuses** existing spatial-memory routes — no new capture endpoints:

- `POST /world/checkpoints/save`
- `GET /world/checkpoints` / `{id}` / `{id}/image?variant=raw`
- `POST /world/checkpoints/{id}/review`
- `POST /world/reset` (original seed restore after calibration)

## Cloud test results (`npm run test:calibration-live`)

Against MockWaypointEngine checkpoint routes (`server/mockCheckpoints.ts`):

| Step | Result |
|---|---|
| `/health.mock === true` | PASS — never claims LIVE |
| `POST /world/start` | PASS |
| List checkpoints includes `initial_seed` | PASS |
| Capture View save with label `forward` | PASS — frame/session/world/epoch/sha/segment/timestamp |
| Raw JPEG SHA matches `image_sha256` | PASS |
| Review approve — SHA unchanged | PASS |
| Review reject — SHA unchanged | PASS |
| `/world/reset` advances epoch + `seed_restored` | PASS |
| Mapped mock-engine capture = `mock_ui` | PASS |
| Explore handoff list still available | PASS |

Also: `npm run test:calibration-ui`, `npm run typecheck` — PASS.

## LIVE / MOCK boundaries (enforced in client)

| Engine | Checkpoint API | Capture `source` |
|---|---|---|
| Unavailable / pure UI | n/a | `mock_ui` |
| `mock:true` (this cloud mock) | yes | `mock_ui` (SHA may exist; still MOCK) |
| Non-mock Waypoint + save OK | yes | `live_waypoint` |

## GPU native-720p acceptance (not run in this cloud)

Requires Windows host with `feature/worldshift-spatial-memory-backend` native 1280×720 Waypoint. Sequence:

1. Backend up (isolated port; do not overwrite archived production).  
2. `npm run dev` → `/calibrate` → Continue → Capture View → Approve → Complete & restore → Start Exploring.  
3. Expect badge **LIVE · checkpoint API**, captures labeled **LIVE Waypoint**, non-null SHA, frame/world/epoch/segment fields, restored epoch in footer.

Do **not** mix browser scheduling / presentation-queue changes into this work.
