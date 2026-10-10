# Backend API Gap Analysis

Reviewed 2026-10-10 against `feature/worldshift-spatial-memory-backend` @ `ad71609`
(`experiments/backend/worldshift/{memory.py,memory_service.py,service.py}`) and the frontend at
`feature/worldshift-visual-memory-ui` @ `0bf4f9b`. This document **does not invent APIs**. Anything not in
§1 is labelled PROPOSED and must not be called by a live client.

## 1. What is actually callable today (isolated service, port 8002)

| Endpoint / event | Status | Notes verified in code |
|---|---|---|
| `GET /world/memory?session_id=S` | IMPLEMENTED | Returns the world dict (`world_id, session_id, prompt, created_at, scene_context, checkpoints[]`) plus `epoch, navigation, trajectory[], recovery, limits` |
| `GET /world/checkpoints?session_id=S` | IMPLEMENTED | `{world_id, session_id, checkpoints}` |
| `POST /world/checkpoints/save` `{session_id, label?}` | IMPLEMENTED | 409 no frame yet · 507 quota (32/world or 256 MiB) · 422 uniform image |
| `GET /world/checkpoints/{id}?session_id=S` | IMPLEMENTED | 404 if not in the current world |
| `GET /world/checkpoints/{id}/image?session_id=S&variant=raw` | IMPLEMENTED | `variant=enhanced` returns 404 (no enhanced files exist). MIME detected (seed may be PNG; frames are JPEG). `Cache-Control: no-store` |
| `POST /world/checkpoints/{id}/review` `{session_id, approved}` | IMPLEMENTED | Sets `quality.reviewed=true, approved` |
| `POST /world/checkpoints/restore` `{session_id, checkpoint_id, variant:'raw', accept_unreviewed?:false}` | IMPLEMENTED | 409 unreviewed / lifecycle busy / enhancement active · 404 unknown · 503 GPU failure (service enters `error`) |
| `GET /world/recovery?session_id=S` | IMPLEMENTED | `{status:'idle'|'restoring'|'completed'|'failed', ...}` |
| WS memory events `navigation_update` (≥1 s apart), `checkpoint_saved`, `checkpoint_updated`, `recovery_started/completed/failed` | IMPLEMENTED | JSON-only, never consume credits, dropped when the subscriber queue has ≥6 items |
| `remembered_view_candidate` event type | Declared in the contract type only | **Never emitted** by the code |
| `POST /world/checkpoints/enhance`, `GET /world/enhancement/jobs/J` | **PLANNED** | Not routed |
| Obstacle analysis fields | **PROPOSED** | Offline CPU script only |
| Calibration, observations, localization, visual-memory snapshot, recovery suggestions, promote | **PROPOSED** (this folder) | Not routed |

Existing stream and lifecycle endpoints (`/world/start|pause|resume|reset|stop`, `WS /world/stream`) are
unchanged and outside the scope of this analysis.

## 2. DTO field mismatches (frontend `src/types/worldMemory.ts` ↔ backend)

### 2.1 Pose: `EstimatedPose` ↔ `Navigation`

| Frontend | Backend | Adapter rule |
|---|---|---|
| `x` | `x` | copy |
| `y` | `z` | **`y = −z`** (FRONTEND_COMPATIBILITY_REPORT §2.1) |
| `headingDeg` | `yaw` (rad, [−π, π)) | `((yaw·180/π) % 360 + 360) % 360` |
| `uncertainty?` | `confidence` (heuristic, 1 = best) | **Do not convert.** Add an optional `navConfidence` field and show it as qualitative and heuristic |
| `epoch` | `epoch` | copy |
| `updatedAtMs` | `server_elapsed_ms` (server `perf_counter` clock) | `updatedAtMs = performance.now()` at receipt. **Never subtract server and client clocks** (API_CONTRACT rule) |
| — | `pitch`, `units:'estimated_units'`, `cumulative_movement`, `segment_id`, `relationship`, `control_seq` | Add optional pass-through fields. **`segment_id` is required** for correct trail breaks |

### 2.2 Trail: `TrailPoint` ↔ `trajectory[]`

`trajectory` is a list of `Navigation` snapshots: at most one per second while generating, plus one per
restore/reset (`reposition`). Mapping: `continuous = (point.segment_id === previous.segment_id)`. Do not
derive breaks from epoch alone. Epoch and segment change together today, but they are different concepts,
and proposed calibration and reset flows may diverge.

### 2.3 Checkpoint

| Frontend `Checkpoint` | Backend checkpoint | Adapter rule / gap |
|---|---|---|
| `id` | `checkpoint_id` | copy |
| `index` | array position | position in `checkpoints[]` (append-only) |
| `name` | `label` | copy |
| `capturedAtMs` | `created_at` (ISO UTC) | `Date.parse` (wall-clock display only) |
| `imageUrl` | `image_url` (relative path incl. `session_id`) | prefix with `engineHttpBase()` (read-only import) |
| `enhancedImageUrl` | `enhanced_image_url` (always `null` today) | copy; `enhancementSupported = false` in live |
| `imageSha256` | `image_sha256` | copy (§4) |
| `pose` | `navigation` | §2.1 |
| `status` | — (backend has `quality.status`, `enhancement_status`) | **Gap.** Derive `'available'`. Restore states come from `recovery`, not per-checkpoint |
| `restorable`, `recoverySuitable` | `quality.approved`, `quality.reviewed` | `restorable = approved && isRecoveryAnchorAllowed(kind)` (product policy, FRONTEND_COMPATIBILITY_REPORT §2.6) |
| `unsuitableReason` | — | Frontend policy text, or "Not reviewed" |
| `kind` | `provenance: 'initial_seed'|'raw_video_frame'` | `initial_seed → 'sdxl_starter'` **only if** `scene_context.model` is the SDXL HIGH model, else `'unknown'`; `raw_video_frame → 'waypoint_frame'` |
| `manual` | — | **Gap.** The only signal is `label === 'Periodic candidate'`, which is fragile. Proposed additive field `capture_reason: 'initial_seed'|'manual'|'periodic'` (Codex K5) |
| `source` | — | `'live'` |
| `obstacleAnalysis` | absent | `null`. **Never fabricate in live** |
| — | `world_id`, `session_id`, `epoch`, `frame_id`, `control_seq`, `quality.indicators`, `actions_history_reference`, `prompt` | Optional pass-through. `epoch` and `world_id` are needed for isolation |

### 2.4 Session

| Frontend `WorldMemorySession` | Backend | Gap |
|---|---|---|
| `sessionId` | `session_id` | — |
| — | `world_id` | **Gap.** The frontend has no world identity. Stop/start creates a new session, so keying on `sessionId` is sufficient today; carry `world_id` anyway |
| `worldName`, `promptSummary` | `prompt`, `scene_context` | Frontend supplies these |
| `restore: RestoreJob` | `recovery` + restore HTTP response + events | Phase mapping in FRONTEND_COMPATIBILITY_REPORT §2.5 |
| `enhancementSupported` | — | `false` in live |

## 3. Missing endpoints, by consumer need

| Frontend need (FRONTEND_REQUIREMENTS.md) | Available? | Gap |
|---|---|---|
| Navigation estimate at 5–10 Hz | `navigation_update` at **1 Hz**; REST snapshot on demand | **Rate gap.** Polling `GET /world/memory` at 1–2 Hz returns the whole world, including up to 2048 trajectory points (heavy). PROPOSED (Codex K2): configurable event rate (e.g. 4 Hz), plus `GET /world/memory?session_id=S&trajectory_since=<index>` or a light `GET /world/navigation`. **Not active**, so do not call it |
| Checkpoint capture (manual + auto) | Yes | — |
| Restore with progress/failure, new epoch, same session | Yes | — |
| Trail segment markers | Yes, via `segment_id` and `relationship` | No `anchor` field saying *which* checkpoint a segment restored from. PROPOSED (K4): `restored_from_checkpoint_id` on the `restored_view` trajectory point |
| Enhanced still | **PLANNED** | — |
| Obstacles | **PROPOSED** | — |
| Calibration views | **PROPOSED** | Depends on A0 (CODEX_CALIBRATION_HANDOFF) |
| Auto "remembered views" beyond 32 checkpoints | **PROPOSED** (observations) | Until then, auto captures are periodic checkpoints (10 s), which consume the 32-item quota |
| Event subscription in the browser | Events arrive on `/world/stream` | The frontend stream hook is frozen and does not forward them. Polling is the only path without a Codex-tested patch (§5) |

## 4. Image SHA-256 provenance (verified in code)

- `image_sha256 = sha256(raw)`, computed on the exact bytes written to `<checkpoint_id>.raw` and served by
  `/image?variant=raw`.
- Initial seed: `raw` is the **seed file bytes** from disk (SDXL output, typically PNG). It should equal
  `scene_context.image_sha256` when `scene.json` recorded one. A live client can cross-check this for free.
- Video checkpoints: `raw` is `jpeg[-1]` of the latest batch, **byte-identical to the JPEG streamed to
  clients** for that `frame_id` (q85, 4:4:4). It is not the pre-encode tensor.
- Enhanced variants would be separate files and never carry the raw hash (PLANNED).
- **Recommended client check** (cheap, no backend change): after fetching `image_url`, compute
  `crypto.subtle.digest('SHA-256', bytes)` and show "SHA verified" only when it matches. Otherwise show
  "SHA unverified". The current gallery prints the hash but never verifies it.
- Mock hashes (`mockImageSha256`) are deterministic fake hex strings. They must never appear in live mode.

## 5. Session and epoch handling

| Rule | Backend today | Frontend today | Required |
|---|---|---|---|
| Stale or unknown `session_id` | 404 on every memory route | — | Live client treats 404 as "session gone": stop polling, clear state, show "Memory unavailable" |
| Epoch increments | Reset and restore each `+1`; a `status` message with the new epoch is sent after the subscriber queue is cleared | Stream hook adopts the epoch from **any** JSON message with a differing `epoch` and flushes its queue | Codex keeps memory-event epochs equal to the live service epoch (K3). The memory client re-reads REST after an epoch change |
| Memory client epoch | — | Set **once** at `attach` (`streamEpochHint`) | The live client must take `epoch` from each snapshot and drop responses older than the last seen epoch |
| New world | Stop/start creates a new `session_id` and `world_id`; never joins paths | `attach` re-runs on `sessionId` change | Compatible |
| Old-epoch frames during restore | Flushed server-side | Rejected by stream hook | Compatible |
| Race: snapshot fetched before a restore, returned after | — | — | Discard a snapshot whose `epoch` is lower than the last applied one |

## 6. Unsupported assumptions to remove or avoid

| Assumption | Where | Correction |
|---|---|---|
| Live memory can come from the 8000 production backend | Frontend default origin | Memory API exists only on 8002. Use `ENGINE_TARGET`/env, not code changes |
| `docs/world-memory/API_CONTRACT.md` is "PENDING" | Frontend branch placeholder | The backend branch has the v1 contract at the **same path**. When branches meet, keep the backend version and drop the placeholder |
| Navigation at 5–10 Hz exists | FRONTEND_REQUIREMENTS | It is 1 Hz today |
| Manual vs auto is known | Frontend `manual` | Needs `capture_reason` (PROPOSED K5) |
| Enhancement is available | Mock `enhancementSupported:true` | PLANNED; must be false in live |
| `remembered_view_candidate` events will arrive | Backend contract type union | Never emitted; do not build UI that waits for it |
| A checkpoint without a pose has a position | `ExplorationMap` `?? 0` | Skip the marker |
| Headings are degrees of real camera rotation | Compass "°" | Nominal only until A0, and even then a human estimate. Label "est." |
| Restore makes the player "go back" to that spot | — | Already correctly worded in `RestoreOverlay` |
| Human approval on `/create` (localStorage) equals backend `quality.approved` | HQ starter gate | Separate systems. The live client must call `POST …/review` for backend approval |

## 7. Uncertainty: what each number means

| Quantity | Today | Meaning | Proposed |
|---|---|---|---|
| `x`, `z` | IMPLEMENTED | Applied-batch dead reckoning, 1 estimated unit per generated second of walking | unchanged |
| `yaw` | IMPLEMENTED | Σ `mouse_dx` × 0.002 rad. **Arbitrary**; real visual turn per unit unknown until A0 | `nav_model` block exposing the constants and their source (K6) |
| `confidence` | IMPLEMENTED | Linear decay with movement and mouse magnitude, floor 0.05. Heuristic | `sigma_xy`, `sigma_yaw` (LOCALIZATION §2.2); keep `confidence` derived |

## 8. Restoration and segment boundaries

Verified behaviour: `restore()` validates ownership, review and image **before** changing state. Under
the GPU lock it clears controls, calls `backend.restore_anchor`, increments epoch, flushes subscribers
and sends `status`. `reposition(cp)` then sets `latest=None` and starts a **new `segment_id`** with
`relationship:'restored_view'`, **copying the checkpoint's estimated pose**, and appends one trajectory
point. Reset does the same with checkpoint 0.

Implications:

- A new segment always starts after a restore or reset ✔. The frontend must break the trail on `segment_id` ✔.
- The copied pose means the new segment starts *on top of* the anchor's old marker. That is honest only
  with a "restored from" label. Without `restored_from_checkpoint_id` (K4), the frontend can attribute
  the jump using the restore HTTP response (`checkpoint_id`) or the `recovery` object.
- `geometric_continuity` is implicit today (always none). The rule lives in documentation (API_CONTRACT:
  "Position proximity is not physical return") and in the frontend's `continuous:false`.
- `/world/reset` (also used by the frontend's Stability Mode auto-restore through `stream.reset()`) emits
  **no memory event**, only a stream `{type:'status', status, epoch}`. A polling memory client detects it
  only as an epoch increase plus a new `segment_id` in the next snapshot. Restore emits
  `recovery_started/completed`; reset does not.
- A 503 during restore leaves the service in `error`. The UI must show a terminal error with a "start a
  new world" action, not offer retries.
