# World Memory API v1 — isolated native720 backend

Implementation branch: `feature/worldshift-spatial-memory-backend`. Backend8002, Vite4834; `/engine` proxies8002. Existing accepted8000/4821 remains separate. Cursor owns frontend integration. This contract is published before integration; test status belongs in RESULTS.md, not implied by these examples.

Implementation status (2026-10-10): checkpoint saving, raw images, estimated navigation, review, manual raw restoration and recovery GET are implemented and GPU-tested in isolation. HIGH SDXLBase is implemented; `quality:"high"` is the sole supported selector in this checkpoint. FAST remains available on the accepted8000 fallback, not through this selector yet. Enhancement endpoints and remembered-view suggestions below are PLANNED, not callable. Obstacle schema is separately PROPOSED for Cursor review and has no live API fields. Do not mock planned operations as LIVE or assume map UI has been integrated by Cursor.

## Existing protocol

`POST /world/start {scene_id,seed_image_path:null,prompt}` returns `{session_id,status:"starting",prompt_conditioning:false,prompt_status:"metadata_only"}`. Native model is `Overworld/Waypoint-1.5-1B`, FP8,1280×720. Waypoint does not interpret text. `POST /world/pause|resume|reset|stop {session_id}` remains supported. Reset restores the original seed using the same session, increments epoch and clears controls/credits. Stop/start means a new world with unrelated navigation; it never silently joins paths.

`WS /world/stream?session_id=...`: JSON frame metadata immediately followed by one complete binary JPEG. `frame_id,batch_id,batch_index,batch_size,epoch,width,height,seq,client_timestamp_ms,generated_at_ms,inference_ms` remain. ACK every received frame, including skipped presentation: `{type:"display_ack",frame_id,epoch,client_elapsed_ms}`. Controls: `{type:"control",seq,keys:["w"],mouse_dx:0,mouse_dy:0,timestamp_ms}`. Client timestamps are monotonic elapsed milliseconds; input RTT uses the echoed timestamp on that same clock. Do not subtract server and browser clocks. Frame credits and input ACKs are independent of memory events.

Memory events are JSON-only and NEVER consume frame credits or predict that the next message is a JPEG. Only `type:"frame"` establishes the pending binary envelope. Events are best-effort; REST snapshots are authoritative. Reject stale session/world/epoch updates. Keep the last canvas during restoration, label the transition, and reject old-epoch decoder callbacks.

## Scene generation

`POST /scenes/generate {prompt,seed?,style?,perspective:"first_person",quality:"high",steps?}` returns202 `{job_id,status:"queued",poll_url}`. Poll `/scenes/jobs/{job_id}` untilready/error; ready metadata contains `world_start_request` and `image_url`. Defaultqualityhigh uses pinned SDXLBase,30steps,CFG5,Euler,1280×720. FAST selection in this service is planned; existingTurbo fallback on8000 uses4steps,CFG0,640×384→640×360. Highsteps1–50. Unsupported fields422. Stop the world before generating a new scene; pausedworlds409. No silentmockfallback.

## REST memory capabilities

All memory requests require the CURRENT `session_id`; stale/unknown sessions404. IDs are opaque32hex strings. Browser storage must not be treated as server world ownership.

| Method/path | Request | Response |
|---|---|---|
| GET `/world/memory?session_id=S` | — | `{world_id,session_id,epoch,navigation,trajectory,checkpoints,recovery,limits}` |
| GET `/world/checkpoints?session_id=S` | — | `{world_id,session_id,checkpoints}` |
| POST `/world/checkpoints/save` | `{session_id,label?:string}` | Checkpoint object;200 |
| GET `/world/checkpoints/C?session_id=S` | — | Checkpoint object |
| GET `/world/checkpoints/C/image?session_id=S&variant=raw` | variant raw/enhanced | Realimage;404 for missingvariant |
| POST `/world/checkpoints/C/review` | `{session_id,approved:boolean}` | Updatedcheckpoint; approval represents client/userreview |
| POST `/world/checkpoints/restore` | `{session_id,checkpoint_id,variant:"raw"|"enhanced",accept_unreviewed?:false}` | `{session_id,world_id,status,epoch,checkpoint_id,recovery_ms}` |
| GET `/world/recovery?session_id=S` | — | Recovery state |
| PLANNED POST `/world/checkpoints/enhance` | `{session_id,checkpoint_id,strength?:0.2,seed?:int,steps?:30}` |202 `{job_id,status,poll_url}`; explicitpausewhileGPUworkruns |
| PLANNED GET `/world/enhancement/jobs/J?session_id=S` | — | `{job_id,status,checkpoint_id,error?,latency_ms?,candidate?}` |

Manual saves use the last genuinely generated received-by-service JPEG, not a screenshot synthesized by the frontend. Initial seed is checkpointzero. Checkpoint maximum32/world; trajectory2048points; retainedworldfolders8 with boundedstorage. Periodic capture configurable via `WORLDSHIFT_CHECKPOINT_SECONDS` (default10,min5,max120). Periodic saves select candidates, not certifiedcleanviews. Failed invalid-frame checks are observable and never guarantee a hallucination detector.

```ts
type Navigation = {
  x:number; z:number; yaw:number; pitch:number; units:'estimated_units';
  confidence:number; cumulative_movement:number; segment_id:string;
  relationship:'new_unknown'|'estimated_continuous'|'restored_view';
  control_seq:number; epoch:number; server_elapsed_ms:number;
};
type Checkpoint = {
  checkpoint_id:string; world_id:string; session_id:string; epoch:number;
  prompt:string; frame_id:number|null; control_seq:number; created_at:string;
  provenance:'initial_seed'|'raw_video_frame'; label:string;
  navigation:Navigation; quality:{status:string; reviewed:boolean; approved:boolean; indicators:Record<string,number>};
  image_url:string; enhanced_image_url:string|null; enhancement_status:string;
};
type MemoryEvent = {
  type:'navigation_update'|'checkpoint_saved'|'checkpoint_updated'|'remembered_view_candidate'|
       'recovery_started'|'recovery_completed'|'recovery_failed';
  world_id:string; session_id:string; epoch:number; event_seq:number;
  server_elapsed_ms:number; payload:unknown;
};
```

Headingzero is+Z; positiveyaw turns toward+X. Forward is(sin(yaw),cos(yaw));Dstrafe is(cos(yaw),−sin(yaw)). Opposedkeys cancel; diagonals normalize. Nominalmodeltime4/60s per4framebatch,1estimatedunit/s,0.002radians perappliedmouseunit. These are arbitrary dead-reckoning calibration constants, not meters or measuredcameraangles. Only actually generated batches advance tracking; paused/disconnected periods do not. Uncertainty grows with motion/rotation. Segmentmarkers delimit restored/new paths. Position proximity is not physical return.

## Recovery and enhancement races

Restorevalidates ownership/image/quality BEFORE changing state, then uses lifecycle+GPUlocks. Oldepochsflush and controlsreset. SameSID/worldID, newepoch/segment. The image is fed through supportedreset+append_frame lifecycle; noKVinjection. Completion means initializedanchor, not guaranteed visualquality. A failed preflight leaves the activeworld intact. FailureduringGPUreinitialization may markserviceerror; do not claim rollback to exactVAE/KVstate.

Oneenhancementjob atatime. It pausesstreaming explicitly, acquires sharedGPU/lifecyclelocks, runslocalSDXLimg2img, retains raw evidence and saves a SEPARATE candidate. It does not autoapprove or restore. Stop/reset/restore conflicts return409 while busy. Clients poll jobs; closing browser does not cancel a runningGPUoperation. NoGPUjobkill endpoint is provided. Enhancedcandidate can alterstructure and requires review. Unsupported/missingvariants404; unreviewed restoration409 unless explicitlyaccepted. NoGemini integration or credentials.

Mock-safe sequence: hello →frameJSON/JPEG pairs→navigation_update→checkpoint_saved→recovery_started→status(newEpoch)→recovery_completed→newEpochframepairs. Mockevents/images must remain visiblyMOCK. Do not advertise semanticrepair, SLAM, collisiongeometry, physicallyconnectedlocations or A*navigation ofvideo.

## v1.1 additions (branch `claude/live-memory-backend`, 2026-10-10)

File renamed from `API_CONTRACT.md` to resolve the duplicate path with the frontend placeholder. All
additions are **additive and optional**; v1 clients keep working. Status: **IMPLEMENTED** in code with
CPU unit tests (`experiments/tests/test_live_memory.py`). GPU smoke status is recorded in RESULTS.md.
Canonical client contract: `docs/visual-spatial-memory:docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md`.

| Addition | Shape |
|---|---|
| `GET /health` → `capabilities`, `contract` | `{memory_api, checkpoint_restore, calibration_capture, light_navigation, calibration_backend:false, observations:false, obstacles:false, enhancement:false}`, `contract:"world-memory-v1.1"` (null when the memory app is not loaded) |
| `POST /world/checkpoints/save` | optional `capture_reason: 'manual'|'calibration'` (default `manual`); `calibration: {calibration_id: /^[a-z0-9]{6,32}$/, kind: 'capture'|'return_check', soft_label: forward|forward_right|right|behind_right|behind|behind_left|left|forward_left|unlabeled}` required exactly when `capture_reason:'calibration'` (422 otherwise). Soft labels are player tags, **never** commanded or measured angles |
| Checkpoint object | `capture_reason: 'initial_seed'|'manual'|'periodic'|'calibration'`, `calibration: {...}|null`, `review: {reviewed_at, reviewer, reason}` |
| `POST /world/checkpoints/{id}/review` | optional `reviewer` (≤64), `reason` (≤200). Recovery-anchor approval only; calibration acceptance is client-side and never calls this |
| Navigation object | `anchor_kind: 'world_start'|'reset_to_seed'|'checkpoint_restore'`, `restored_from_checkpoint_id: string|null` (persist for the whole segment) |
| `GET /world/memory` | `trajectory_offset`, `trajectory_total` (absolute indices), `nav_model {version, yaw_rad_per_unit:0.002, units_per_second:1, nominal_fps:60, source:'nominal_constant', turn_gain:'not_established', a0_report}`, `limits.nav_event_hz` |
| `GET /world/navigation?session_id=S&trajectory_since=N` | Light read: `{world_id, session_id, epoch, navigation, trajectory_offset, trajectory_total, trajectory[≥N], recovery_status, nav_model}` |
| `navigation_update` rate | `WORLDSHIFT_NAV_EVENT_HZ` 1–5 (default 1; launcher uses 2). Trajectory sampling stays 1 Hz |
| Invariant (K3) | Every memory event carries the live service epoch at emit time; after restore the `status` message precedes `recovery_completed` (unit-tested) |

Unchanged: stream protocol, credit window, restore review gate (409), quotas (32 checkpoints/world,
256 MiB, 8 world folders). Calibration captures count toward the 32-checkpoint quota. Phase A0 found no
reliable mouse-to-angle mapping (`experiment/native720-turn-gain-a0@d7c7435`), so automated or
fixed-angle calibration is not offered.
