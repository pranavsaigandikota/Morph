# LIVE Calibration and Visual-Memory Contract (v1)

**Answers:** `docs/ux/API_QUESTIONS_FOR_CLAUDE.md` on `cursor/worldshift-ux-polish-cd95` @ `535f02e`
**Verified against:** backend `feature/worldshift-spatial-memory-backend` @ `ad71609` (isolated, port **8002**) and
production `Codex Plus/worldshift` (port **8000**)
**Date:** 2026-10-10 · **Revision 4** · **Phase A0 (turn gain): COMPLETE, result NO-GO** for reliable fixed-angle turning
(reported by Codex: 21 GPU trials across 3 scenes; the raw trial report is **not yet published in the repository** and should be
committed on the backend branch for traceability) · **Guided manual calibration: APPROVED, without degree mapping**

## Status tags (on every field and endpoint)

| Tag | Meaning |
|---|---|
| **IMPLEMENTED** | Exists in code on 8002 @ `ad71609` and was GPU-tested in isolation (RESULTS.md). Callable today |
| **PROPOSED** | Designed in this folder; not callable. Build only behind MOCK |
| **BLOCKED(x)** | Cannot be specified honestly until dependency *x* lands (for example K13) |
| **BLOCKED(A0 NO-GO)** | Ruled out by the A0 result. **Not scheduled.** Would need a new experiment with a different method; do not build toward it |
| **CLIENT** | Computed or held by the frontend only; never sent as backend truth |

## 0. The decision in one paragraph

LIVE calibration v1 is **guided manual calibration**. The UI asks the *player* to turn toward each intended
direction with their own mouse, waits until they stop sending input, and captures the frame with the
**IMPLEMENTED** `POST /world/checkpoints/save`. Each capture is therefore a genuine Waypoint frame with a
server-computed SHA-256, applied-control history and a nominal pose estimate. It uses only IMPLEMENTED
endpoints, so it **does not depend on A0**. It only runs against **8002**. **Automated** camera turning
(by script or backend controller) is **BLOCKED(A0 NO-GO)**: Codex's 21-trial A0 found no reliable mapping
from mouse units to a fixed turn angle across three scenes. **Revision 4: guided manual calibration is
approved without any degree mapping.** Directions are *soft labels* the player assigns, never angles. After the sweep, calibration exits through the IMPLEMENTED `POST /world/reset`, so
exploration starts from the clean seed.

---

## 1. Answers to the eight questions

### Q1. Calibration session fields, directions, capture provenance

- The session object is **CLIENT**-held in v1 (Cursor's existing `sessionStorage` pattern). The backend has
  no calibration object. A server-side `/world/calibration` is **PROPOSED** (CALIBRATION_WORKFLOW §10).
- Each **capture is a backend checkpoint**: `provenance:'raw_video_frame'`, the last JPEG the service
  generated, byte-identical to the stream, with a server SHA-256. Captures are **never** SDXL stills and
  **never** client-side canvas grabs. The canvas may show a frame up to one presentation-queue age
  (≤140 ms) older than the one saved, so the UI must display the **returned** image, not the canvas.
- Captures are tagged through the IMPLEMENTED `label` field: `calibration:<calibration_id>:<kind>:<direction>`
  (≤100 chars). A dedicated `capture_reason:'calibration'` field is **PROPOSED (K5)**.
- **Directions are soft labels, not angles** (revision 4). A capture may be labelled `forward`, `right`, …
  or `unlabeled`. No degree value is attached in LIVE: `intendedYawDeg` is **removed** (always `null`), and
  Cursor's `DIRECTION_YAW_DEG` is MOCK-only. *(Superseded text kept for history:* `intendedYawDeg` was a UI
  schematic.) The backend's `navigation.yaw` for the capture is a nominal estimate from applied mouse units
  (0.002 rad/unit; arbitrary, and A0 found no reliable mapping to a visual angle).
- **Default LIVE plan:** `forward → right → left → forward (return check)`. **Behind is off by default**:
  a 180° turn is the highest-drift view (CALIBRATION_WORKFLOW §4). It can be enabled as an option.
  Eight *labels* may be offered as soft labels. An eight-direction *angular* layout is **BLOCKED(A0 NO-GO)**.

### Q2. Who turns the camera?

| Mode | Turning by | Status |
|---|---|---|
| `guided_manual` | The **player**, through existing controls (`lookControl.ts`, unchanged); the UI only prompts and waits | **IMPLEMENTED endpoints → buildable now (8002)** |
| `automated_backend` | Backend `CalibrationController` through a `ControlSource` seam | **BLOCKED(A0 NO-GO)**; K9 not scheduled |
| `automated_frontend` (UI scripts `mouse_dx` over WS) | — | **BLOCKED(A0 NO-GO); not permitted.** Browser timer and rAF throttling (NATIVE720_UPDATE measured callback gaps up to ~1 s) plus the 0.5 s server control timeout make the turn amounts non-deterministic. Use only as a fallback if K9 is rejected, and only after A0 |

The UI must **not** synthesise turning in guided mode. It must not invent a degree value either: on-screen
copy says "Turn to roughly your right", not "Turn 90°".

### Q3. Map coordinates, origin, epochs, discontinuities

| Item | Contract | Status |
|---|---|---|
| Units | `estimated_units` (1 per *generated* second of walking; paused or disconnected time does not count). Not metres | IMPLEMENTED |
| Origin | `(x, z) = (0, 0)`, `yaw = 0` at world start. Heading 0 = the starting view direction ("Start" on the compass) | IMPLEMENTED |
| Axes to UI | `uiX = x`, `uiY = −z`, `headingDeg = deg(yaw) mod 360`. Clockwise positive matches Cursor's SVG and calibration-ray convention | IMPLEMENTED (wire) / CLIENT (mapping) |
| Epoch | Increments on every `reset` and `restore`. Old-epoch frames are flushed | IMPLEMENTED |
| Segment | New `segment_id` on every reset/restore; `relationship:'restored_view'` on the first point. **Trail breaks on `segment_id` change** (`continuous:false` in Cursor's model) | IMPLEMENTED |
| Restored pose | The backend **copies the anchor checkpoint's pose** into the new segment (reset → checkpoint 0 = origin). Draw a "↺ restored / reset" marker, never a connecting line | IMPLEMENTED (behaviour) |
| Calibration rays | **Revision 4: no angular rays.** Show calibration captures as markers at their *estimated* pose (usually near the origin) with the soft label as text. Bearing = `null`. Rays at nominal yaw or at label angles are **BLOCKED(A0 NO-GO)** | CLIENT / BLOCKED(A0 NO-GO) |
| Uncertainty ring | No backend uncertainty radius exists. `sigma_xy`/`sigma_yaw` are **PROPOSED (K7)**. LIVE: no ring sized from data; optionally a fixed-size ring with a qualitative `confidence` band labelled "heuristic" | BLOCKED(K7) |

### Q4. Recovery anchors, approval, SHA-256

- The server marks review state; it does **not** compute `recoverySuitable`. IMPLEMENTED fields:
  `quality.reviewed`, `quality.approved`, `quality.status` (`'candidate_unreviewed'`; blank frames are
  rejected at save with 422 and never stored), `provenance`, `image_sha256`.
- **Reject a frame** with `POST /world/checkpoints/{id}/review {approved:false}` (IMPLEMENTED). Approve with
  `approved:true`. Restore without approval returns **409** unless `accept_unreviewed:true`, which the
  product UI **never** sends.
- `recoverySuitable` stays **CLIENT**: `approved && isRecoveryAnchorAllowed(kind)`. The browser-local HQ
  approval on `/create` is **separate** and does not set server approval.
- **Calibration acceptance ≠ anchor approval.** Accepting a calibration view must **not** call `/review`;
  that would make it restorable. Calibration accept/reject is CLIENT state until a server calibration
  review is designed (PROPOSED).
- **SHA-256:** `image_sha256 = sha256(bytes served by /image?variant=raw)`. For the seed it is the SDXL
  file bytes (usually PNG). For frames it is the streamed q85 JPEG. The UI verifies it in the browser
  (`crypto.subtle.digest`) and shows "verified" only on a match (CLIENT, recommended). Reviewer identity
  and time on reviews are **PROPOSED (K12)**.

### Q5. Obstacles

**Not LIVE.** `OBSTACLE_SCHEMA_PROPOSAL.md` is **PROPOSED**. No route returns `obstacle_analysis`, and the
only producer is an offline CPU script. Keep the MOCK toggle off by default. Field-level status and
the mismatches found are in §2.6.

### Q6. Which confidence values are real

| Value | Class | Status | LIVE UI rule |
|---|---|---|---|
| Frame `width/height`, `frame_id`, `epoch`, `inference_ms`, `generated_at_ms` | MEASURED | IMPLEMENTED | Show as-is |
| `image_sha256` | MEASURED | IMPLEMENTED | Show; verify in browser |
| `quality.indicators.luma_std`, `laplacian_variance` | MEASURED pixel statistics (**not** quality judgements) | IMPLEMENTED | Optional "diagnostics" only, not as a quality score |
| `recovery_ms` | MEASURED (server-side initialise time; excludes the next paint) | IMPLEMENTED | Optional |
| `navigation.confidence` | HEURISTIC (linear decay from 1 to a 0.05 floor; not a probability) | IMPLEMENTED | Qualitative band, labelled heuristic, **no %** |
| `navigation.x/z/yaw` | ESTIMATED from applied controls; nominal constants | IMPLEMENTED | "Est." label |
| `quality.approved` | REVIEWED (human) | IMPLEMENTED | Show reviewer state |
| Calibration capture confidence (Cursor `CalibrationCapture.confidence`) | **UNAVAILABLE** | — | **`null` in LIVE**. The MOCK values 0.55–0.75 must not leak |
| Position/heading uncertainty radius | UNAVAILABLE | PROPOSED (K7) | Do not draw from data |
| Obstacle `detection_score` | MODEL SCORE, uncalibrated | PROPOSED | MOCK only |
| Obstacle `relative_depth.confidence`, `bearing_rad`, `estimated_position` | UNAVAILABLE (always null) | PROPOSED | — |
| Revisit / place-match strength | UNAVAILABLE | PROPOSED (Phase E) | — |
| Turn gain (units per degree) | UNAVAILABLE | BLOCKED(A0 NO-GO) | Never display |

### Q7. Refresh World vs checkpoint restore

| Path | 8000 (**archived** release, 360p model; regression testing only) | 8002 (isolated native 720p; **product target**) | Product use |
|---|---|---|---|
| `POST /world/reset {session_id}` | IMPLEMENTED | IMPLEMENTED (+ new memory segment at checkpoint 0) | **Refresh World**: the approved default recovery path |
| `POST /world/checkpoints/restore` | **Does not exist** (404) | IMPLEMENTED, review-gated, GPU-tested in isolation | Explicit "Restore this view" on **approved** anchors, 8002 only |
| Automatic restore | Cursor's Stability Mode calls reset (CLIENT policy) | Same | Unchanged |
| Degradation-triggered suggestion | — | PROPOSED (Phase F) | — |

So, yes: **reset is the only recovery path on 8000**, and it remains the default on 8002. *(Revision 4: 8000 is an archived
service for regression testing only, **not a 360p product fallback**; new Explorer features are never required of it.)* A
restore-from-image API exists **only on 8002**. It is usable for explicit, approved-anchor restores but is
not yet merged or production. User preference recorded in NATIVE720_UPDATE: original-seed restoration,
which is what reset does.

### Q8. Native 720p frame/protocol compatibility

The **wire protocol is identical** on 8000 and 8002 (same `hello`, `frame` + binary JPEG envelope,
`display_ack`, `control`, `control_ack`, `status`, credit window of 8). Differences a frontend can see:

| Item | 8000 (archived, regression only) | 8002 (product target) |
|---|---|---|
| `/health.model` | `Overworld/Waypoint-1.5-1B-360P` | `Overworld/Waypoint-1.5-1B` |
| `frame.width × height` | 640 × 360 | **1280 × 720** |
| `hello` | no dimensions (unchanged) | no dimensions (unchanged) |
| Received FPS (measured) | ~107–110 | ~27.6–28.7 |
| Extra JSON message types | none | `navigation_update`, `checkpoint_saved`, `checkpoint_updated`, `recovery_*` (memory events; never followed by binary) |
| Memory/checkpoint routes | none | IMPLEMENTED |

No frontend-visible field changes are needed for 720p. Native-720p detection rule (CLIENT): treat the
stream as product-native only if `health.model === 'Overworld/Waypoint-1.5-1B'` **and** the frames report
`1280×720`. A `capabilities` object in `/health` is **PROPOSED (K13)**. Until it exists, enable LIVE
memory/calibration only when both conditions hold. Remaining Codex dependencies are in §6.

---

## 1A. Calibration capture acceptance ≠ recovery-anchor approval (revision 4)

These are two different decisions about two different things. They must never share a button, a field
or an endpoint.

| | Calibration capture acceptance | Recovery-anchor approval |
|---|---|---|
| Question asked | "Is this a usable view for my look-around memory?" | "Is this frame clean enough to **restart generation from**?" |
| Where stored | CLIENT `LiveCalibrationCapture.calibrationReview` (`pending · accepted · rejected · retaken`) | Server `quality.reviewed` / `quality.approved` on the checkpoint |
| Endpoint | **None** (server calibration review is PROPOSED only) | `POST /world/checkpoints/{id}/review` (IMPLEMENTED) |
| Effect | Shown or hidden in the calibration strip and gallery filter | Enables `POST /world/checkpoints/restore` for that checkpoint (IMPLEMENTED; 409 otherwise) |
| Default | `pending` | `reviewed:false, approved:false` |
| Retake | New capture = new checkpoint; old one marked `retaken` (CLIENT) and **kept** as evidence | n/a |
| Can one imply the other? | **No.** Accepting a calibration view never calls `/review` | **No.** Approving an anchor never marks a calibration capture accepted |

If a player explicitly wants a calibration view as a recovery anchor, that is a second, separate action
in the checkpoint gallery (the anchor-approval flow, subject to the CLIENT anchor policy). Calibration
captures are Waypoint frames (`kind:'waypoint_frame'`), so the current strict frontend policy will
usually refuse them as anchors anyway.

## 2. Field-level TypeScript contract

```ts
// =====================================================================
// A. WIRE TYPES: exact backend JSON (snake_case). Source of truth: 8002 @ ad71609
// =====================================================================

/** GET /health (both ports). IMPLEMENTED */
export interface WireHealth {
  status: 'loading' | 'ready' | 'starting' | 'running' | 'paused' | 'stopping' | 'error'
  model_loaded: boolean
  error: string | null
  model: 'Overworld/Waypoint-1.5-1B' | 'Overworld/Waypoint-1.5-1B-360P' | string
  quant: 'fp8w8a8'
  model_load_count: number
  prompt_conditioning: boolean | null
  /** PROPOSED (K13). Absent today; absent ⇒ infer from model + frame dims */
  capabilities?: {
    memory_api: boolean; checkpoint_restore: boolean; calibration_backend: boolean
    observations: boolean; obstacles: boolean
  }
}

/** WS `frame` metadata, followed by exactly one binary JPEG. IMPLEMENTED, unchanged */
export interface WireFrameMeta {
  type: 'frame'; session_id: string; frame_id: number; batch_id: number
  batch_index: number; batch_size: number; epoch: number
  generated_at_ms: number; inference_ms: number
  width: number; height: number            // 1280×720 on 8002 · 640×360 on 8000
  encoding: 'jpeg'; seq: number; client_timestamp_ms: number | null
  server_input_to_generated_ms: number | null
}

/** IMPLEMENTED. Nominal dead reckoning; arbitrary units and constants */
export interface WireNavigation {
  x: number; z: number                     // estimated_units
  yaw: number                              // rad, [-π, π), 0 = start view, + = clockwise/right
  pitch: number                            // rad, clamped ±π/2
  units: 'estimated_units'
  confidence: number                       // HEURISTIC 0.05..1, not a probability
  cumulative_movement: number              // estimated_units
  segment_id: string                       // 32-hex
  relationship: 'new_unknown' | 'estimated_continuous' | 'restored_view'
  control_seq: number; epoch: number
  server_elapsed_ms: number                // server clock: never subtract from client clock
  // PROPOSED (K7): sigma_xy?: number; sigma_yaw?: number
}

/** IMPLEMENTED */
export interface WireCheckpoint {
  checkpoint_id: string; world_id: string; session_id: string; epoch: number
  prompt: string; frame_id: number | null; control_seq: number
  created_at: string                       // ISO-8601 UTC
  provenance: 'initial_seed' | 'raw_video_frame'
  label: string                            // ≤100; calibration captures use `calibration:<id>:<kind>:<dir>`
  navigation: WireNavigation
  quality: {
    status: 'candidate_unreviewed'          // only stored value today
    reviewed: boolean; approved: boolean
    indicators: { luma_std: number; laplacian_variance: number }   // MEASURED pixel stats
  }
  image_url: string                        // relative; prefix with engine base
  enhanced_image_url: null                 // enhancement PLANNED
  enhancement_status: 'none'
  image_sha256: string                     // MEASURED, sha256 of served raw bytes
  actions_history_reference: { session_id: string; control_seq: number; epoch: number; frame_id: number | null }
  capture_reason?: 'initial_seed' | 'manual' | 'periodic' | 'calibration'          // PROPOSED (K5)
  review?: { reviewed_by: string | null; reviewed_at: string | null; reason: string | null }  // PROPOSED (K12)
  obstacle_analysis?: WireObstacleAnalysis | null                                 // PROPOSED (§2.6)
}

/** GET /world/memory. IMPLEMENTED */
export interface WireMemorySnapshot {
  world_id: string; session_id: string; prompt: string; created_at: string
  scene_context: { scene_id?: string; prompt?: string; style?: string | null; seed?: number | null
                   effective_prompt?: string; model?: string; revision?: string; image_sha256?: string }
  checkpoints: WireCheckpoint[]
  epoch: number
  navigation: WireNavigation
  trajectory: WireNavigation[]             // ≤2048, ~1 Hz while generating + 1 per reset/restore
  recovery: WireRecovery
  limits: { checkpoints: 32; trajectory_points: 2048; disk_mb: 256; world_folders: 8; checkpoint_seconds: number }
  nav_model?: { version: number; yaw_rad_per_unit: number; units_per_second: number
                source: 'nominal_constant' | 'human_estimate_from_probe'; probe_report?: string }  // PROPOSED (K6)
}

/** GET /world/recovery and the `recovery` field. IMPLEMENTED */
export type WireRecovery =
  | { status: 'idle'; error: null }
  | { status: 'restoring'; checkpoint_id: string; error: null }
  | { status: 'completed'; session_id: string; world_id: string; epoch: number; checkpoint_id: string; recovery_ms: number; error: null }
  | { status: 'failed'; error: string }

/** POST /world/checkpoints/restore → 200. IMPLEMENTED */
export interface WireRestoreResponse {
  session_id: string; world_id: string; status: 'running' | 'paused'
  epoch: number; checkpoint_id: string; recovery_ms: number
}

/** POST /world/reset → 200 (both ports). IMPLEMENTED */
export interface WireActionResponse { session_id: string; status: string; epoch: number }

/** FastAPI error body. IMPLEMENTED */
export interface WireError { detail: string | { message: string; quality?: unknown } }

/** WS memory events (8002 only). JSON-only; never followed by a binary frame. IMPLEMENTED */
export interface WireMemoryEvent {
  type: 'navigation_update' | 'checkpoint_saved' | 'checkpoint_updated'
      | 'recovery_started' | 'recovery_completed' | 'recovery_failed'
  world_id: string; session_id: string; epoch: number; event_seq: number
  server_elapsed_ms: number; payload: unknown
}
// NOTE: 'remembered_view_candidate' appears in API_CONTRACT's type union but is NEVER emitted.

// =====================================================================
// B. FRONTEND LIVE CALIBRATION TYPES: additive to src/types/calibration.ts
// =====================================================================

export type CalibrationMode =
  | 'guided_manual'        // IMPLEMENTED endpoints; player turns. Buildable now (8002)
  | 'automated_backend'    // BLOCKED(A0 NO-GO): not scheduled

export type CalibrationCaptureKind = 'capture' | 'return_check'

/** Suggested PROMPT ORDER only (rev. 4); soft labels, no angles. Behind omitted by default (highest drift) */
export const LIVE_DEFAULT_PLAN: Array<{ kind: CalibrationCaptureKind; direction: CalibrationDirection }> = [
  { kind: 'capture', direction: 'forward' },
  { kind: 'capture', direction: 'right' },
  { kind: 'capture', direction: 'left' },
  { kind: 'return_check', direction: 'forward' },
]

export interface LiveCalibrationSession {           // CLIENT-held (sessionStorage), keyed by session+world
  id: string                                        // CLIENT, 12 base36 chars (fits the label)
  mode: CalibrationMode
  source: 'live'
  sessionId: string; worldId: string                // from GET /world/memory (IMPLEMENTED)
  epochAtStart: number                              // abort if epoch changes (other than our own exit reset)
  plan: typeof LIVE_DEFAULT_PLAN
  includeBehind: boolean                            // default false
  holdStillMs: number                               // CLIENT, default 1200
  phase: LiveCalibrationPhase
  captures: LiveCalibrationCapture[]
  exitAction: 'reset_to_seed'                       // IMPLEMENTED /world/reset
  outcome: null | 'completed' | 'completed_with_flags' | 'cancelled'
         | 'aborted_world_changed' | 'aborted_quota' | 'aborted_session_lost' | 'error'
  turnGainSource: 'none'                            // A0 NO-GO: stays 'none'; no degree mapping exists
  createdAtMs: number; completedAtMs: number | null
}

export interface LiveCalibrationCapture {
  id: string                                        // = checkpoint_id (IMPLEMENTED)
  kind: CalibrationCaptureKind
  direction: CalibrationDirection                   // prompt shown when captured (CLIENT)
  softLabel: CalibrationDirection | 'unlabeled'     // player-assigned tag (CLIENT, rev. 4); NOT a commanded or measured angle
  intendedYawDeg: null                              // REMOVED in rev. 4 (A0 NO-GO); always null in LIVE
  supersededBy: string | null                       // CLIENT: set on retake; the old checkpoint is kept as evidence
  source: 'live_waypoint'
  checkpointId: string                              // IMPLEMENTED
  imageUrl: string                                  // IMPLEMENTED raw variant URL
  imageSha256: string                               // IMPLEMENTED (server)
  shaVerified: boolean | null                       // CLIENT (crypto.subtle)
  frameId: number | null; epoch: number             // IMPLEMENTED
  capturedAtMs: number                              // from created_at (IMPLEMENTED)
  estimatedYawRad: number                           // ESTIMATED nominal (IMPLEMENTED); diagnostics only, NEVER rendered as an angle (A0 NO-GO)
  nominalYawDeltaDeg: null                          // REMOVED in rev. 4: no degree claims
  inputIdleMsBeforeCapture: number                  // CLIENT-measured (no controls sent)
  confidence: null                                  // UNAVAILABLE in LIVE. Always null
  calibrationReview: 'pending' | 'accepted' | 'rejected' | 'retaken'   // CLIENT; NOT /review (§1A: not anchor approval)
  qualityIndicators: { luma_std: number; laplacian_variance: number }  // MEASURED stats, diagnostics only
}

export type LiveCalibrationPhase =
  | 'idle' | 'checking_capabilities' | 'unsupported' | 'awaiting_first_frame'
  | 'prompting' | 'waiting_for_hold' | 'capturing' | 'captured'
  | 'review' | 'exiting' | 'complete' | 'skipped' | 'aborted' | 'error'
```

### 2.6 Obstacle DTO: field status and mismatches

All fields are **PROPOSED**. Below: the offline analyzer `experiments/analyze-checkpoint-cpu.py`, the
proposal, and Cursor's `ObstacleAnalysis` / `ObstacleObservation`.

| Field | Proposal | Analyzer output | Cursor DTO | Resolution |
|---|---|---|---|---|
| analysis key on checkpoint | `obstacle_analysis` | n/a (separate report) | `obstacleAnalysis` | Wire stays snake_case; the adapter maps it |
| `status` | `disabled|queued|running|ready|error` | `'ready'` | same enum | ✔ |
| models | "model revisions" | `models:{depth:{id,revision},detector:{id,revision}}` (nested) | `model_revisions: Record<string,string>` (flat) | **Mismatch.** Adopt the nested analyzer shape `models` on the wire; adapter flattens to `"<id>@<rev>"` |
| latency | "latency" | `latency_including_load_seconds` (seconds, includes load) | `latency_ms` | **Mismatch.** Wire `latency_ms` excluding load, plus `load_ms` separately (PROPOSED) |
| `job_id` | yes | absent | optional | stays optional |
| `bbox_normalized` | [x0,y0,x1,y1] in 0..1 | same | same | ✔ |
| `direction.screen_x/y` | — | box-centre offset in **[−1, 1]**, 0 = image centre | number | Document the range ✔ |
| `direction.bearing_rad` | null | null | `number|null` | Always null (no measured FOV) |
| `relative_depth.value` | rank | median of within-image rank; **near = lower** (inverse-depth output inverted) | number|null | ✔ |
| `relative_depth.near_is` | `'lower'` | `'lower'` | `'lower'|'higher'` | Narrow to `'lower'` |
| `relative_depth.confidence` | null | null | number|null | Always null |
| `estimated_navigation` | `{x,z,yaw,pitch,segment_id,confidence}` | the full `WireNavigation` (superset) | subset | ✔ (extra fields ignored) |
| `estimated_position` | null | null | `null` | Always null |
| `detection_score` | model score | OWL-ViT score (permissive 0.12 threshold measured) | number | Uncalibrated; display as "model score" |
| `review_status` | `'unreviewed'` | `'unreviewed'` | `unreviewed|accepted|rejected` | Accept the frontend superset; review API PROPOSED |
| `limitations[]` | yes | 3 fixed strings | string[] | ✔ |

---

## 3. Example JSON (shapes from code; values illustrative)

`GET /world/memory?session_id=…` on 8002 (trimmed):

```json
{
  "world_id": "5f0c1e…", "session_id": "a91d…", "prompt": "Florida street after a hurricane",
  "created_at": "2026-10-10T19:00:02.114Z",
  "scene_context": { "scene_id": "9bda60c5d71a411680f71969c487684d", "seed": 20261011,
                     "model": "stabilityai/stable-diffusion-xl-base-1.0",
                     "image_sha256": "8b4d373fb652ca1c8fb81f0791c81916ced00caff76907743ca9d46ba2ee02f3" },
  "checkpoints": [
    { "checkpoint_id": "c0…", "provenance": "initial_seed", "label": "Initial seed", "epoch": 1,
      "frame_id": null, "control_seq": -1, "created_at": "2026-10-10T19:00:02.300Z",
      "navigation": { "x": 0, "z": 0, "yaw": 0, "pitch": 0, "units": "estimated_units", "confidence": 1,
                      "cumulative_movement": 0, "segment_id": "s1…", "relationship": "new_unknown",
                      "control_seq": -1, "epoch": 1, "server_elapsed_ms": 0 },
      "quality": { "status": "candidate_unreviewed", "reviewed": false, "approved": false,
                   "indicators": { "luma_std": 52.1, "laplacian_variance": 1210.4 } },
      "image_url": "/world/checkpoints/c0…/image?session_id=a91d…&variant=raw",
      "enhanced_image_url": null, "enhancement_status": "none",
      "image_sha256": "8b4d373fb652ca1c8fb81f0791c81916ced00caff76907743ca9d46ba2ee02f3",
      "actions_history_reference": { "session_id": "a91d…", "control_seq": -1, "epoch": 1, "frame_id": null } }
  ],
  "epoch": 1,
  "navigation": { "x": 0.0, "z": 0.0, "yaw": 0.42, "pitch": -0.01, "units": "estimated_units",
                  "confidence": 0.93, "cumulative_movement": 0.0, "segment_id": "s1…",
                  "relationship": "estimated_continuous", "control_seq": 212, "epoch": 1,
                  "server_elapsed_ms": 853112.4 },
  "trajectory": [ { "x": 0, "z": 0, "yaw": 0, "segment_id": "s1…", "epoch": 1, "...": "…" } ],
  "recovery": { "status": "idle", "error": null },
  "limits": { "checkpoints": 32, "trajectory_points": 2048, "disk_mb": 256, "world_folders": 8, "checkpoint_seconds": 10 }
}
```

`POST /world/checkpoints/save {"session_id":"a91d…","label":"calibration:k3x9q2m7a1bz:capture:right"}` → 200:

```json
{ "checkpoint_id": "e7…", "world_id": "5f0c1e…", "session_id": "a91d…", "epoch": 1, "frame_id": 1843,
  "control_seq": 230, "created_at": "2026-10-10T19:00:41.902Z", "provenance": "raw_video_frame",
  "label": "calibration:k3x9q2m7a1bz:capture:right",
  "navigation": { "x": 0, "z": 0, "yaw": 0.31, "pitch": 0.0, "units": "estimated_units", "confidence": 0.88,
                  "segment_id": "s1…", "relationship": "estimated_continuous", "epoch": 1, "...": "…" },
  "quality": { "status": "candidate_unreviewed", "reviewed": false, "approved": false,
               "indicators": { "luma_std": 47.9, "laplacian_variance": 803.2 } },
  "image_url": "/world/checkpoints/e7…/image?session_id=a91d…&variant=raw",
  "enhanced_image_url": null, "enhancement_status": "none",
  "image_sha256": "3c1f…(64 hex)", "actions_history_reference": { "...": "…" } }
```

Note: `yaw: 0.31` rad after the player turned "right". A0 found **no reliable** mapping from mouse units
to a fixed visual angle, so this number is diagnostics only. The UI shows the soft label "right" and **no
degree value at all** (revision 4).

Errors (IMPLEMENTED):

```json
{ "detail": "No generated frame available" }                       // 409 save before any frame
{ "detail": "Checkpoint quota32 reached" }                           // 507
{ "detail": { "message": "Image rejected", "quality": { "status": "invalid_uniform", "...": "…" } } }  // 422
{ "detail": "Review checkpoint or explicitly accept unreviewed candidate" }                           // 409 restore
{ "detail": "Unknown session" }                                      // 404 stale/unknown session_id (8002); "Unknown memory session" if the session has no memory world; 8000 returns {"detail":"Not Found"} (route absent)
```

`POST /world/checkpoints/restore` → 200:
`{ "session_id": "a91d…", "world_id": "5f0c1e…", "status": "running", "epoch": 3, "checkpoint_id": "e7…", "recovery_ms": 181.3 }`

`POST /world/reset` → 200: `{ "session_id": "a91d…", "status": "running", "epoch": 2 }`

---

## 4. UI state machines

### 4.1 LIVE guided calibration (8002 only)

```
idle ──start──► checking_capabilities
  checking_capabilities ── health.model≠720p-native OR frame≠1280×720 OR GET /world/memory 404 ──► unsupported
                                                                   (offer MOCK demo, clearly labelled, or Skip)
  checking_capabilities ── ok ──► awaiting_first_frame
awaiting_first_frame ── frame(epoch=E) ──► prompting[i=0]          (store epochAtStart=E, worldId)
prompting[i] ── user ready ──► waiting_for_hold                     (copy: "Turn to roughly your RIGHT, then hold still")
waiting_for_hold ── no controls sent for holdStillMs ──► capturing  (input during wait resets the timer)
capturing ── POST save(label) 200 ──► captured[i]                   (show RETURNED image + SHA check)
capturing ── 409 no frame ──► waiting_for_hold                     (retry after next frame)
capturing ── 422 uniform ──► prompting[i]                          ("Frame was blank; try again")
capturing ── 507 quota ──► aborted(aborted_quota)
captured[i] ── i < plan.length-1 ──► prompting[i+1]
captured[last] ──► review                                          (side-by-side forward vs return_check; accept/reject: CLIENT)
review ── finish ──► exiting ── POST /world/reset 200 ──► complete   (new epoch + segment; exploration starts at seed)
ANY ── epoch ≠ expected (external reset/restore/Stability auto-restore) ──► aborted(aborted_world_changed)
ANY ── 404 session / stream closed ──► aborted(aborted_session_lost)
ANY ── user Skip/Cancel ──► exiting(reset) ──► skipped|cancelled
exiting ── reset 503 ──► error                                     (terminal; "start a new world")
```

Rules: disable Stability Mode auto-restore while calibrating (or treat it as `aborted_world_changed`).
Captures stay in the world as evidence after abort. Nothing is deleted.

### 4.2 Checkpoint restore (8002, approved anchors only)

```
idle ── restore(id) [approved && policy] ──► preparing ── POST restore ──► reinitializing
reinitializing ── 200 {epoch:E'} ──► awaiting_frames ── frame(epoch≥E') ──► complete ──► idle
reinitializing ── 409 ──► failed(recoverable: "review first" | "busy, retry")
reinitializing ── 404 ──► failed(recoverable) + refresh snapshot
reinitializing ── 503 ──► failed(TERMINAL: service error, "start a new world")
```

### 4.3 Refresh World (both ports)

```
idle ── refresh ──► resetting ── POST /world/reset 200 {epoch:E'} ──► awaiting_frames ── frame(epoch≥E') ──► idle
resetting ── 409/503 ──► failed (503 terminal)
(8002) the next memory poll shows a new segment_id → draw "↺ reset to start" marker; no trail edge
```

### 4.4 Memory client connection

```
mock ◄── VITE_WORLD_MEMORY_SOURCE=mock or unsupported
live: attached ── poll GET /world/memory (1 Hz) ──► applied (drop if epoch < lastEpoch)
      404 ──► detached("Memory unavailable")   network error ──► backoff 1→5 s, keep last snapshot greyed
```

---

## 5. API compatibility matrix

| Capability | 8000 archived (360p; regression only) | 8002 isolated (720p; product target) | Frontend today (`535f02e` / `7d0ea97`) | LIVE v1 action |
|---|---|---|---|---|
| Stream `hello/frame/ack/control` | IMPLEMENTED | IMPLEMENTED (identical wire) | LIVE | none |
| 1280×720 frames | — (640×360) | IMPLEMENTED | targets 720p, flags sub-720p | detect via model + dims |
| Memory events on WS | — | IMPLEMENTED (ignored safely by the frontend) | ignored | poll REST instead (adapter freeze) |
| `GET /world/memory` | 404 | IMPLEMENTED | MOCK client | live adapter |
| Save checkpoint | 404 | IMPLEMENTED | MOCK | live |
| Review approve/reject | 404 | IMPLEMENTED | **no UI** | add UI |
| Restore from checkpoint | 404 | IMPLEMENTED (review-gated) | MOCK (client-simulated) | live, approved only |
| Refresh World (`/world/reset`) | IMPLEMENTED | IMPLEMENTED | LIVE | none |
| Raw image + SHA-256 | — | IMPLEMENTED | displays mock hash | verify in browser |
| Est. pose / heading / trail | — | IMPLEMENTED (nominal) | MOCK (client estimator) | live mapping; estimator off |
| Segment breaks | — | IMPLEMENTED (`segment_id`) | MOCK (`continuous:false`) | derive from `segment_id` |
| Uncertainty radius | — | PROPOSED (K7) | MOCK ring | hide or qualitative only |
| Guided manual calibration | — | IMPLEMENTED endpoints | MOCK flow `/calibrate` | **build now** (§4.1) |
| Automated calibration turning | — | BLOCKED(A0 NO-GO) | removed in `7d0ea97` | none |
| Eight angular directions | — | BLOCKED(A0 NO-GO) | soft labels only | soft labels |
| Calibration rays at any angle | — | BLOCKED(A0 NO-GO) | MOCK rays (`535f02e`) | markers + soft-label text, no rays |
| Approve / reject / retake calibration capture | — | CLIENT state (no server route) | MOCK (`7d0ea97`) | CLIENT; never calls `/review` |
| Server calibration session / review | — | PROPOSED | — | client-held |
| `capture_reason`, review metadata, `nav_model`, capabilities | — | PROPOSED (K5, K12, K6, K13) | — | ignore if absent |
| Observations > 32, revisit links, localization | — | PROPOSED | — | wait |
| Obstacles | — | PROPOSED (offline script) | MOCK, off by default | keep MOCK |
| Enhancement | — | PLANNED | MOCK | `enhancementSupported=false` |

---

## 6. Remaining Codex dependencies (ordered)

| ID | Item | Unblocks |
|---|---|---|
| ~~A0~~ | **Done: NO-GO** (21 GPU trials, 3 scenes). Remaining action: publish the trial report on the backend branch | — (degree claims, automated turning, angular rays and 8-direction layouts are now BLOCKED(A0 NO-GO)) |
| K8 | Resolve the `API_CONTRACT.md` path collision (frontend placeholder vs backend v1) | clean merge |
| K3 | Memory-event epoch invariant + test | stream-safety guarantee for the epoch-adopting frontend parser |
| K13 | `/health.capabilities` | robust LIVE/MOCK switching (replaces the model-string check) |
| K5 / K12 | `capture_reason` (incl. `'calibration'`); review metadata | reliable calibration tagging, auditable approvals |
| K2 / K6 / K7 | light navigation read; `nav_model`; sigma fields | smoother map, honest uncertainty |
| K9 | ~~Backend calibration controller~~ **Not scheduled** (A0 NO-GO) | — |
| — | Final validated native-720p integration contract (presentation/foreground FPS runs still pending per NATIVE720_UPDATE) | Cursor's adapter freeze lift for 720p |

## 7. Notes on Cursor's MOCK shell (535f02e) for the LIVE switch

- `CALIBRATION_QUAD` includes `behind`; the LIVE default (§2 B) does not. Keep the quad for MOCK only, or
  gate `behind` behind `includeBehind`.
- `mockCaptureDirection` returns `reviewStatus:'accepted'` and a numeric `confidence`. LIVE must use
  `'pending'` and `null`.
- Mock stills are 640×360 SVGs. Under the 720p-only product rule, prefer a 1280×720 viewBox so the
  placeholders don't suggest a 360p capture.
- `ExplorationMap` still places pose-less checkpoints at `(0,0)` and sizes the uncertainty ring from
  `pose.uncertainty`. Neither should apply in LIVE (CURSOR_IMPLEMENTATION_HANDOFF C5).
- Calibration rays are drawn from the origin at intended yaw. That is correct as a schematic. Label them
  "intended", and anchor them at the forward capture's estimated pose (the origin at world start).

## 8. Mapping to Cursor's `INTEGRATION_CHECKLIST.md` (UX branch @ `139384c`)

Cursor froze the UX branch at `535f02e` and gated LIVE wiring on this contract plus Codex A0 and 720p
results. Items owned by Claude, or affected by this contract:

| Checklist | Resolution in this contract |
|---|---|
| 1.1 lifecycle | §4.1. Create (CLIENT) → plan (`LIVE_DEFAULT_PLAN`) → capture × n (IMPLEMENTED save) → review (CLIENT) → exit via reset (IMPLEMENTED) → complete \| skipped \| aborted |
| 1.2 UI phases 1:1 | `world_created` ↔ `checking_capabilities` + `awaiting_first_frame` · `scan_prompt` ↔ `prompting[0]` · `capturing` ↔ `prompting`/`waiting_for_hold`/`capturing`/`captured` · `review` ↔ `review` · `complete` ↔ `exiting` → `complete` · `skipped` ↔ `skipped`. **New UI states needed:** `unsupported`, `aborted`, `error` (no MOCK equivalent today) |
| 1.3 skip | **Documented no-op before the first capture** (no backend call; the player has not been prompted to turn). After ≥1 capture, skip or cancel performs the exit reset (`POST /world/reset`), so exploration starts from the clean seed. No server calibration object exists, so there is no "acknowledged skip" event (PROPOSED only) |
| 1.4 no client yaw commands | Satisfied. `guided_manual` sends **no** scripted mouse commands; only the player's own input flows through unchanged `lookControl`. Scripted turning is BLOCKED(A0 NO-GO) |
| 1.5 contract-driven directions | **Revision 4:** the contract owns the *soft-label vocabulary* `forward, forward_right, right, behind_right, behind, behind_left, left, forward_left, unlabeled` and a suggested prompt order (`LIVE_DEFAULT_PLAN`). **No angle table.** `intendedYawDeg` is removed (A0 NO-GO). `includeBehind` defaults to false |
| 2.1 required `source` | `LiveCalibrationCapture.source: 'live_waypoint'` (required). `'mock_ui'` only in MOCK. **`'sdxl'` is not a valid calibration capture source**: the SDXL seed is checkpoint 0 (`provenance:'initial_seed'`), shown as a reference, not as a capture |
| 2.2 / 2.4 raw SHA, no substitution | §1 Q1/Q4: server SHA-256 of served raw bytes; show the **returned** image, never the canvas |
| 2.5 enhanced separate | Enhancement PLANNED; `enhanced_image_url: null`; analysis SHA stays on the raw image |
| 3.1 gallery mapper fields | `id ← checkpoint_id`, image ← `image_url`, time ← `created_at`, direction ← label parse (later `capture_reason`, K5), review ← `quality.reviewed/approved` (anchor) **or** CLIENT `calibrationReview` (calibration), **confidence ← `null`** |
| 3.2 suitability from backend/human | Server: `quality.approved` (human, IMPLEMENTED). CLIENT: `recoverySuitable = approved && policy(kind)`. A server-side suitability field does not exist; the reject reason is CLIENT text until K12 |
| 4.1–4.3 pose semantics | §1 Q3 and §2A `WireNavigation`. `uncertainty` has **no LIVE source**: show "n/a" or the qualitative heuristic `confidence` band; never a % |
| 4.4 calibration rays | **Bearing = `null`, permanently under A0 NO-GO.** No rays; markers with soft-label text (rev. 4) |
| 5.1 epoch + discontinuity | Epoch +1 and new `segment_id` on reset and restore. Trail break keyed on `segment_id` |
| 5.2 server enforce | Server enforces **review** (409 without approval). The stricter "no Waypoint-frame anchors" policy is CLIENT-only; server enforcement of a kind-policy is not implemented (would need a new PROPOSED flag) |
| 5.3 Refresh = `/world/reset` | Confirmed (§1 Q7) |
| 6.1 reconnect same session | Backend reconnect within one session was GPU-tested on 8002 (RESULTS.md: "reconnect and stop/start world isolation passed"). Stop/start always creates a new session and world |
| 6.4 calibration identity on reconnect | Key `(session_id, world_id)`. **Same session, same epoch:** resume; rebuild captures from `GET /world/memory` checkpoints whose label starts `calibration:<id>:`. **Epoch changed:** `aborted_world_changed`. **New session or world:** discard CLIENT state (server checkpoints of the old world stay archived). Never create a new calibration implicitly |
| 7.1 frame ≥1280×720 | Only **8002** satisfies this (§1 Q8) |

### §8 acceptance aligned to `:8002` (revision 4: decided)

The earlier conflict is resolved. **Product acceptance runs on the isolated native-720p service `:8002`**
(`ENGINE_TARGET=http://127.0.0.1:8002`). The archived `:8000` service is **never required to gain new
Explorer functionality**. It is kept only for a **separate regression concern**: confirming that the
archived release, Rescue Mission and AI Showdown still behave as recorded. It is **not a 360p product
fallback**, and no 360p mode, selector or demo is offered (`PRODUCT_NATIVE_720P.md`).

| Checklist §8 item | Run against | Status of what it exercises |
|---|---|---|
| 8.1 LIVE stream, native 1280×720, decode errors 0 | **:8002** | IMPLEMENTED |
| 8.2 WASD + mouse-look 60–120 s; Gen/Disp FPS vs Codex native-720p baseline | **:8002** | IMPLEMENTED (baseline: Codex native-720p notes; not an A0 baseline) |
| 8.3 A0 camera-turn test recorded | Codex record | **Done: NO-GO** (21 trials, 3 scenes); trial report to be published |
| 8.4 Pause / Resume / Refresh World (`/world/reset`) / Disconnect | **:8002** | IMPLEMENTED |
| 8.5 LIVE guided calibration captures show real provenance and SHA; MOCK path still labelled | **:8002** | IMPLEMENTED endpoints; UI wiring pending |
| 8.6 Gallery restore blocked for unapproved or policy-unsuitable anchors; seed / approved restore OK | **:8002** | IMPLEMENTED (review-gated restore) + CLIENT policy |
| 8.7 Map shows estimated pose only; no geographic or physical claims | **:8002** | IMPLEMENTED (nominal estimate) |
| 8.8 Rescue Mission five missions + Showdown rates unchanged | **archived :8000 / offline data** | **Regression only** (separate concern) |
| 8.9 No silent MOCK when the backend is down; no silent LIVE in `dev:mock` | **:8002** + `dev:mock` | CLIENT |
| 8.10 Frontend branch isolated; merge only after sign-off | — | process |

Optional archived-service regression (separate from product acceptance): `:8000` starts, streams and
resets exactly as recorded for release `6423304`, with no new routes expected. Failures there are
regressions in the archive, not product blockers for native 720p.

### Gate status (this contract's part)

`[x] Claude reviewed contract`: **this file is the canonical LIVE calibration and visual-memory
contract**, `docs/visual-spatial-memory:docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md`.
The backend wire contract it builds on is cited by source and commit, never by the bare path
`API_CONTRACT.md` (two different files share that path). See [DOCUMENTATION_SOURCES.md](DOCUMENTATION_SOURCES.md).
