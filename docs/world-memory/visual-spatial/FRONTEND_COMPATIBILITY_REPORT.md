# Frontend Compatibility Report

Reviewed 2026-10-10. Read-only review; no frontend code was changed.

| | Branch | Commit |
|---|---|---|
| Frontend (Cursor) | `feature/worldshift-visual-memory-ui` | `0bf4f9b` |
| Backend (Codex, isolated 8002) | `feature/worldshift-spatial-memory-backend` | `ad71609` |
| Architecture (this folder) | `docs/visual-spatial-memory` | `d52fdc2` + this revision |

Both code branches fork from release `6423304`. The frontend is 13 commits ahead of it and the backend
4 commits ahead. **The frontend has never been run against the backend memory API.** Every memory datum
in the UI comes from `MockWorldMemoryClient`, the only `WorldMemoryClient` implementation.

Files reviewed: `src/types/worldMemory.ts`, `src/services/worldMemory/{mockWorldMemoryClient,mockFixtures,mockObstacles}.ts`,
`src/hooks/{useWorldMemory,useWorldStream}.ts`, `src/components/worldMemory/*`,
`src/lib/{lookControl,stabilityMode}.ts`, `src/services/{engineConfig,worldApi,hqStarterCandidates}.ts`,
`server/worldSessions.ts`, `scripts/verify-world-memory.mjs`, and the `docs/world-memory/*` and
`docs/PRODUCT_NATIVE_720P.md` files.

## 1. Feature status matrix

Status key: **LIVE** = works against a real backend today. **MOCK** = UI exists, driven only by mock
data. **ABSENT** = no UI. Backend status comes from [BACKEND_API_GAP_ANALYSIS.md](BACKEND_API_GAP_ANALYSIS.md).

| Feature | Frontend | Backend (8002) | Compatibility verdict |
|---|---|---|---|
| World Explorer shell (header → video → map → gallery) | **LIVE** shell; Waypoint stream, WASD, drag-look and ACKs are real | Stream IMPLEMENTED | Compatible |
| Guided calibration interface | **ABSENT**. No calibration code anywhere in `src/` | **PROPOSED** only (CALIBRATION_WORKFLOW) | Nothing to reconcile yet. Build the UI shell on mock (Cursor handoff C6) |
| Estimated player position | **MOCK**. Client-side dead reckoning from key/mouse hints (`noteControlHint`) | IMPLEMENTED (`navigation` in `GET /world/memory`, `navigation_update` event ~1 Hz) | **Axis and unit mismatch** (§2.1). Live mode must use backend values and must not run the client estimator |
| Estimated heading (Compass) | **MOCK**. `headingDeg`; mock turn constant 0.08°/unit | IMPLEMENTED. `yaw` in radians; nominal 0.002 rad/unit (≈0.115°/unit) | Convert units. Both constants are arbitrary until Phase A0 |
| Position/heading uncertainty | **MOCK**. Fixed `uncertainty` 0.35–0.4, rendered as "unc 40%" | IMPLEMENTED as `confidence` (1 → 0.05, heuristic). Sigma fields PROPOSED | **Semantic mismatch.** Opposite polarity, and "%" implies a probability (§2.3) |
| Exploration map (trail, markers, pan/zoom) | **MOCK** data, real SVG component | Trajectory IMPLEMENTED (1 Hz, ≤2048 points, with `segment_id`) | Compatible after mapping. Two rendering defects (§2.4) |
| Checkpoint gallery and preview | **MOCK** SVG placeholders; shows raw SHA-256 and "unsuitable" badges | IMPLEMENTED: save, list, raw image, SHA-256, review, restore | Compatible after mapping. **Review (approve/reject) UI is missing** |
| Save View | **MOCK** | IMPLEMENTED `POST /world/checkpoints/save` | Compatible |
| Scene restoration | **MOCK**, simulated client-side with timers. **It never calls the backend and never restores the stream.** Stream reset and Stability auto-restore are real (`stream.reset()`) | IMPLEMENTED `POST /world/checkpoints/restore` (review-gated), `/world/reset` | Phases map cleanly (§2.5). Anchor-policy conflict (§2.6) |
| Navigation segment transitions | **Partial.** `TrailPoint.continuous:false` starts a new SVG subpath, so **no edge is drawn across a restore** ✔ | IMPLEMENTED: new `segment_id` and `relationship:'restored_view'` on restore/reset | Compatible in principle. The frontend keys on epoch, not `segment_id`, and has no "restored from" label |
| AI-Inferred Obstacles overlay | **MOCK**, toggle off by default, DTO aligned to the proposal (`SCHEMA_COMPATIBILITY_REPORT.md`) | **PROPOSED**, not active; offline CPU script only | Correctly held at MOCK. One copy issue (§2.7) |
| Enhanced still (raw vs enhanced) | **MOCK** (`enhancementSupported: true`) | **PLANNED**, not callable | Live mode must report enhancement unsupported |
| HQ SDXL starter approval gate | **LIVE** on `/create` (contact sheet, approval stored in localStorage) | SDXL HIGH IMPLEMENTED | Compatible. Approval is client-side only and does not set backend `quality.approved` |
| Observations, revisit links, localization hypothesis | **ABSENT** | **PROPOSED** | Out of scope until backend Phases B–E |

## 2. Detailed findings

### 2.1 Coordinate frame (must fix in the live adapter)

| | Frontend `EstimatedPose` | Backend `Navigation` |
|---|---|---|
| Plane axes | `x`, `y` (SVG, y grows downward) | `x`, `z` |
| Heading | `headingDeg` 0–360 | `yaw` radians in [−π, π) |
| Heading 0 | screen up (−y) | +Z |
| Positive turn | clockwise on screen (toward +x) | toward +X |

The two conventions describe the same frame if **`y_fe = −z`** and **`headingDeg = ((yaw·180/π) mod 360 + 360) mod 360`**.
Check: backend forward at yaw ψ is `(sin ψ, cos ψ)` in (x, z), which becomes `(sin ψ, −cos ψ)` in (x, y_fe).
That is exactly the mock's forward vector `(sin h, −cos h)`. Pitch has no frontend field; pass it through
for future use.

### 2.2 Two estimators must never run at once

`WorldExplorerShell` drives `noteControlHint` every 100 ms when `memory.source === 'mock'`. The mock's
constants (`STEP 4.2` per tick, `0.08°/unit`) differ from the backend's (`1 unit/s`, `0.002 rad/unit`).
FRONTEND_REQUIREMENTS already says "do not invent conflicting physics on the client when live estimates
exist". The live client must therefore omit `noteControlHint`. This is already the guard condition.

### 2.3 Uncertainty display

The backend `confidence` is a heuristic in [0.05, 1], where higher means more confident. The frontend
`uncertainty` is rendered as `unc NN%`. Neither is a probability. Until the PROPOSED `sigma_xy`/`sigma_yaw`
fields exist:

- the adapter passes `confidence` through as a new optional field (for example `navConfidence`);
- the UI shows it as a qualitative band (high / medium / low), labelled "heuristic", **with no "%"**;
- the adapter must not invent `uncertainty = 1 − confidence` as if it were calibrated.

### 2.4 Map rendering defects (real, small)

1. `ExplorationMap` draws a checkpoint without a pose at `(0,0)` (`cp.pose?.x ?? 0`). In live mode this
   fabricates a location. Skip the marker, or list it in the gallery only.
2. The restored segment is drawn in the **same** coordinate frame, starting at the copied checkpoint pose
   (as both mock and backend `reposition()` do). With the hard break this is acceptable for the MVP. It
   still needs a visible "↺ restored from <label>" marker and a per-segment colour, so the overlap is not
   read as walking back to that spot.
3. The 40-unit graph-paper grid suggests a measured scale. Fade it, or label the corner "estimated units".
4. The compass shows "N*". The tooltip explains it, but "Start" or "0° = start view" avoids any north reading.

### 2.5 Restore phases map cleanly onto the real API

| Frontend `RestorePhase` | Backend signal |
|---|---|
| `preparing` | `POST /world/checkpoints/restore` sent |
| `reinitializing` | `recovery_started` event, or the request still in flight |
| `awaiting_frames` | HTTP 200 `{epoch, recovery_ms}` received, no frame with the new epoch drawn yet |
| `complete` | First frame with `epoch ≥ response.epoch` |
| `failed` | 404 (unknown checkpoint/session), 409 (unreviewed, lifecycle busy, enhancement active), 503 (GPU reinit failed: **service enters error state**), or `recovery_failed` |

The existing `RestoreOverlay` copy ("continuity is approximate, not physical travel") already matches the
architecture.

### 2.6 Recovery-anchor policy conflict (product decision needed)

- Frontend `RECOVERY_POLICY`: `allowDegradedWaypointAnchors:false`. `isRecoveryAnchorAllowed()` rejects
  every `kind:'waypoint_frame'`. In the mock, manual saves are restorable and auto captures are not.
- Backend: any checkpoint with `quality.approved:true` (human review) is restorable. Unreviewed ones need
  explicit `accept_unreviewed:true`, which is documented as an experimental override.

Read strictly, the frontend policy allows only the initial seed, which makes "Restore viewpoint" equivalent
to `/world/reset`. This matches the user's earlier preference for original-seed restoration and
HQ_STARTER_APPROVAL. It also means the gallery's restore buttons are mostly disabled in live mode.
**Recommendation:** `restorable = backend.quality.approved && frontendPolicyAllows(kind)`. Keep the strict
policy by default. The UI must **never** send `accept_unreviewed:true` automatically.

### 2.7 Obstacle overlay copy

`ObstacleOverlay` and its legend use "Walkable suggestion" (`walkable_hint`). The overlay is MOCK-only,
off by default and well caveated. However, "walkable" implies traversability, which no current or proposed
signal establishes (LIMITATIONS_AND_RISKS §1). Rename the label to "Possible open path (unverified)".
The internal enum can stay.

### 2.8 Stream and event coupling (safe today, fragile)

- `useWorldStream` sets the pending-binary envelope only for `type:'frame'|'frame_meta'`. Backend memory
  events are ignored, which is safe ✔.
- **However**, any JSON message whose `epoch` differs from the current one makes the client adopt that
  epoch and flush its presentation queue (the `msg.epoch != null && msg.epoch !== epochRef.current`
  branch). Backend memory events carry `epoch` and are emitted with the live service epoch, so today they
  agree with frame epochs. If the backend ever emitted a memory event with a stale or future epoch, the
  client would flush frames. Codex must keep memory-event epochs equal to the current service epoch
  (CODEX handoff, rule K3).
- Memory events are **not** routed to the memory client. `ADAPTER_FREEZE.md` forbids rewriting
  `useWorldStream`, `worldApi` and `engineConfig` without a Codex-tested patch. The live client should
  therefore **poll REST** at first (Cursor handoff C1).

### 2.9 Port and branch topology

- The frontend defaults to `http://127.0.0.1:8000` (`engineConfig.ts`, `vite.config.ts`). Memory routes
  exist only on the isolated **8002** service. Live memory demos need `ENGINE_TARGET=http://127.0.0.1:8002`
  (supported by `vite.config.ts`) or `VITE_WORLD_API_BASE_URL`, without code changes.
- **Path collision:** both branches contain `docs/world-memory/API_CONTRACT.md`. The frontend's copy is a
  17-line "PENDING" placeholder; the backend's copy is the real v1 contract. Merging either branch into
  the other will conflict. The backend version must win (BACKEND_API_GAP_ANALYSIS §6).
- Both branches contain `docs/world-memory/OBSTACLE_SCHEMA_PROPOSAL.md`. The frontend's copy is identical
  in substance (re-added from the proposal).

### 2.10 Things the frontend already does right

- Honest copy throughout ("Approximate trail", "Est. heading", "not geographic", "continuity is approximate").
- No trail edge across restores (`continuous:false` gives an `M` command).
- Raw SHA-256 shown from the **original** image, never the enhanced one. Obstacle analysis is keyed to
  the original SHA.
- Obstacle DTO: `bearing_rad` and `estimated_position` stay `null`; depth is `within_image_rank`; the
  toggle is off by default; LIVE never fabricates rows.
- Native 1280×720 is binding product policy (`PRODUCT_NATIVE_720P.md`); there is no 360p path.
- The MOCK badge is on map, gallery and status (`nav/memory MOCK`).

## 3. Relationship to the published contract (CURSOR_FRONTEND_CONTRACT.md)

The frontend predates the published contract, which was written without access to this branch.
Reconciliation decisions, now reflected in the updated contract:

| Contract item | Decision |
|---|---|
| Contract `EstimatedPose` (x, z, yaw_rad, sigma_*) vs frontend (x, y, headingDeg) | **Keep the frontend types.** Convert in the live adapter (§2.1). The wire stays the backend shape |
| "Islands per segment" layout | **Relaxed for the MVP.** A shared frame with hard breaks, per-segment colour and "restored from" markers is acceptable. Islands are optional later |
| `Observation`, `RevisitLink`, `Localization`, `CalibrationRun` types | Remain PROPOSED. Add them to `types/worldMemory.ts` only when the backend implements them, or as clearly MOCK types for UI shells |
| Evidence tagging | Map onto existing `source:'mock'|'live'` plus per-field labels. A full `evidence` field is not required until observations exist |
| Forbidden-copy list | Applies to the memory map. The obstacle-overlay "walkable" wording is flagged in §2.7 |
