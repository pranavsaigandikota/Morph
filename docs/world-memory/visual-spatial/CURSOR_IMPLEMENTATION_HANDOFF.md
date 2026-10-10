# Cursor Implementation Handoff: Visual Memory

**For:** Cursor (owner of `feature/worldshift-visual-memory-ui`, currently `0bf4f9b`)
**Backend target:** isolated native-720 service on **port 8002**, `feature/worldshift-spatial-memory-backend` @ `ad71609`
**Read first:** [FRONTEND_COMPATIBILITY_REPORT.md](FRONTEND_COMPATIBILITY_REPORT.md), [BACKEND_API_GAP_ANALYSIS.md](BACKEND_API_GAP_ANALYSIS.md)

## 0. Ground rules

1. **Call only IMPLEMENTED endpoints** (BACKEND_API_GAP_ANALYSIS §1). PROPOSED/PLANNED endpoints may
   appear only behind MOCK clients with visible MOCK labels.
2. **Respect `ADAPTER_FREEZE.md`.** Do not edit `useWorldStream.ts`, `worldApi.ts`, `engineConfig.ts` or
   `sceneGeneration.ts`. Importing `engineHttpBase()` read-only is fine. The live memory client uses
   **REST polling**, not stream events.
3. **Native 1280×720 only** (`PRODUCT_NATIVE_720P.md`).
4. **Never** send `accept_unreviewed: true` from product UI.
5. **Never** run the client-side pose estimator (`noteControlHint`) while the live client is active.
6. Live mode never fabricates poses, SHA-256 values, obstacles or enhanced images. Missing data stays
   missing in the UI.
7. Rescue Mission, AI Showdown and PPO data are untouched. Do not reuse `components/simulation/*`.

## 1. Implement immediately (no backend changes, no A0 dependency)

### C1. `LiveWorldMemoryClient` with REST polling (priority 1)

New files:
- `src/services/worldMemory/liveMapping.ts`: pure mapping functions, unit-tested.
- `src/services/worldMemory/liveWorldMemoryClient.ts`: implements the existing `WorldMemoryClient` interface.

Selection: `VITE_WORLD_MEMORY_SOURCE=mock|live` (default `mock`). Live mode is used only when the stream
probe is non-mock. Change the `getWorldMemoryClient()` factory accordingly.

Behaviour:

| Method | Implementation |
|---|---|
| `attach({sessionId})` | Start polling `GET /world/memory?session_id=…` every 1000 ms (configurable). Stop on `detach` or 404 |
| `getSession()` | Last applied snapshot, mapped |
| `saveView()` | `POST /world/checkpoints/save {session_id, label}`. Errors: 409 no frame yet → toast "No generated frame yet"; 507 → "Memory full (32 views)"; 422 → "Frame rejected (blank)". Then refresh |
| `selectCheckpoint` | local state |
| `restoreCheckpoint(id)` | §C4 |
| `noteControlHint` | **Not implemented** (leave undefined) |

Mapping (exact rules in BACKEND_API_GAP_ANALYSIS §2):

```ts
// liveMapping.ts (sketch)
export const toHeadingDeg = (yaw: number) => (((yaw * 180) / Math.PI) % 360 + 360) % 360
export function toPose(n: BackendNavigation, receivedAtMs: number): EstimatedPose {
  return { x: n.x, y: -n.z, headingDeg: toHeadingDeg(n.yaw), epoch: n.epoch,
           updatedAtMs: receivedAtMs, segmentId: n.segment_id, navConfidence: n.confidence,
           pitchRad: n.pitch, relationship: n.relationship }   // NO `uncertainty` derived from confidence
}
export function toTrail(points: BackendNavigation[], receivedAtMs: number): TrailPoint[] {
  return points.map((p, i) => ({ x: p.x, y: -p.z, headingDeg: toHeadingDeg(p.yaw), atMs: receivedAtMs,
    epoch: p.epoch, segmentId: p.segment_id,
    continuous: i > 0 && p.segment_id === points[i - 1].segment_id }))
}
export function toCheckpoint(c: BackendCheckpoint, index: number, base: string, policy: AnchorPolicy): Checkpoint {
  const kind = c.provenance === 'initial_seed' ? 'sdxl_starter' : 'waypoint_frame'   // see note below
  const approved = c.quality.approved === true
  return { id: c.checkpoint_id, index, name: c.label, capturedAtMs: Date.parse(c.created_at),
    imageUrl: base + c.image_url, enhancedImageUrl: null, imageSha256: c.image_sha256 ?? null,
    pose: c.navigation ? toPose(c.navigation, Date.now()) : null, status: 'available',
    restorable: approved && policy.allows(kind), recoverySuitable: approved && policy.allows(kind),
    unsuitableReason: !c.quality.reviewed ? 'Not reviewed' : !approved ? 'Rejected in review'
                      : policy.allows(kind) ? null : policy.reason,
    source: 'live', manual: c.label !== 'Periodic candidate' && c.provenance !== 'initial_seed',  // fragile until K5
    kind, obstacleAnalysis: null, worldId: c.world_id, epoch: c.epoch,
    reviewed: c.quality.reviewed, approved: c.quality.approved }
}
```

Note on `kind`: map `initial_seed → 'sdxl_starter'` only when `snapshot.scene_context.model` identifies
the SDXL HIGH model. Otherwise use `'unknown'`.

Epoch and staleness: keep `lastEpoch`. Discard any snapshot with `epoch < lastEpoch`. When the epoch
increases, clear any `RestoreJob` in `awaiting_frames` once the stream reports a frame with that epoch
(read the existing `meta.epoch` prop; no stream changes needed).

Load note: the snapshot includes up to 2048 trajectory points. At 1 Hz on localhost this is acceptable for
the MVP. Do not poll faster than 1 Hz until Codex ships the light navigation endpoint (Codex K2).

### C2. Additive type fields (priority 1)

In `src/types/worldMemory.ts`, add **optional** fields only, so the mock keeps compiling:
`EstimatedPose.{segmentId, navConfidence, pitchRad, relationship}`, `TrailPoint.segmentId`,
`Checkpoint.{worldId, epoch, reviewed, approved, shaVerified}`, `WorldMemorySession.{worldId, epoch}`.

### C3. Review UI (priority 1; the backend requires it for restore)

In `CheckpointPreview`, live mode only: **Approve as recovery anchor** / **Reject** buttons call
`POST /world/checkpoints/{id}/review {session_id, approved}`. Show "Unreviewed / Approved / Rejected".
Copy: "Approve only if this view is clear and recognisable. Approval is your judgement, not an automatic
quality check." The `/create` HQ approval stays separate (it is browser-local and does not set backend
approval).

### C4. Real restore flow (priority 1)

`POST /world/checkpoints/restore {session_id, checkpoint_id, variant:'raw'}`. Map phases as in
FRONTEND_COMPATIBILITY_REPORT §2.5. Errors:

| Status | UI |
|---|---|
| 409 unreviewed | "Review this view first" (link to C3) |
| 409 lifecycle/enhancement busy | "Another world action is in progress. Try again in a moment" |
| 404 | "This view is no longer in the current world"; then refresh |
| 503 | Terminal: "Generation failed during restore. Start a new world." No retry button |

Keep the existing "continuity is approximate, not physical travel" copy. Stability Mode's
`stream.reset()` also starts a new segment. The live client sees it as an epoch and segment change on the
next poll (reset emits no memory event).

### C5. Map corrections (priority 1)

In `ExplorationMap` (and the mock, so both stay consistent):

1. Skip markers for checkpoints whose `pose` is null. Do **not** fall back to `(0,0)`.
2. Colour trail sub-paths per `segmentId`. Keep the existing `M` break, never an edge across segments.
3. At each segment start with `relationship === 'restored_view'`, draw a "↺ restored" marker. Attribute it
   to the checkpoint from the restore response, or label it "Reset to start" when the epoch changed with no
   restore in flight.
4. Replace `unc NN%` with a qualitative band from `navConfidence`
   (≥0.66 high · ≥0.33 medium · else low) and the label "heuristic". No percent sign.
5. Corner label: "Approximate trail · estimated units". Fade the grid.
6. Compass: replace "N*" with "Start" (heading 0 = the start view's direction). Keep "Est. heading".

### C6. SHA-256 verification in the browser (priority 2)

After loading a live checkpoint image: `fetch(imageUrl)` → `crypto.subtle.digest('SHA-256', buf)` →
compare with `imageSha256`. Show "SHA verified ✓" or "SHA mismatch ⚠", and treat a mismatch as an error.
Mock hashes are never "verified".

### C7. Mock memory REST in `server/worldSessions.ts` (priority 2)

Mirror the **IMPLEMENTED** routes exactly (paths, bodies, status codes, response shapes from
BACKEND_API_GAP_ANALYSIS §1–2), with `mock: true` in every payload and watermarked placeholder images.
This lets C1–C5 be tested in Cursor Cloud without a GPU. Do not add PROPOSED routes to this mock.

### C8. Copy fixes (priority 2)

- Obstacle legend "Walkable suggestion" → "Possible open path (unverified)". The internal enum can stay.
- Never show "°" headings without "est." nearby.

### C9. Calibration UI shell on MOCK (priority 3; not wired)

`src/components/worldMemory/CalibrationPanel.tsx`, rendered only when `VITE_CALIBRATION_UI=mock`:

- Mode label and progress: "Look-around in progress: intended heading 90° (2 of 5)".
- Review strip: thumbnails captioned **"intended 0° / 90° / 270°"**, with return-check pairs
  (forward₀ vs return) showing the verdict `ok | mild_drift | severe_drift`, and Accept/Reject per view.
- Outcome banner for `completed | completed_with_flags | aborted_* | cancelled`. On abort: "Calibration
  stopped: views were inconsistent. You can still explore normally."
- Input lock notice: "Controls are paused during the look-around."
- Types: copy `CalibrationRun` from CURSOR_FRONTEND_CONTRACT §4 into a **separate** file
  `src/types/visualMemoryProposed.ts`, marked PROPOSED.
- MOCK watermark on every thumbnail. No calls to `/world/calibration/*` (they do not exist).

## 2. Do NOT implement yet

| Item | Waiting on |
|---|---|
| Live calibration (start/cancel/progress) | Codex Phase A, after A0 |
| Observation gallery beyond the 32 checkpoints | Codex Phase B endpoints |
| Revisit links, localization hypothesis chip | Codex Phase E plus measured precision (T6) |
| Live obstacle overlay | Obstacle analysis activation (PROPOSED) |
| Enhanced still compare in live | Enhancement endpoints (PLANNED) |
| Stream event tap in `useWorldStream` | A Codex-tested patch (Codex K1) |
| Sigma/uncertainty ellipses | Codex K7 |
| Light navigation polling > 1 Hz | Codex K2 |

## 3. Acceptance checks

Automated (extend `scripts/verify-world-memory.mjs` or add `verify-world-memory-live.mjs` against the C7 mock):

- [ ] `toPose`: yaw 0 → heading 0, forward (W) moves −y; yaw π/2 → heading 90, forward moves +x.
- [ ] `toTrail`: a segment change gives `continuous:false`. The path string has no `L` across segments.
- [ ] Snapshot with a lower epoch than last applied is ignored.
- [ ] 404 on poll stops polling and shows "Memory unavailable".
- [ ] A pose-less checkpoint renders no map marker.
- [ ] Unreviewed checkpoint: restore button disabled; review enables it (subject to anchor policy).
- [ ] The live client never calls `noteControlHint`. No request body contains `accept_unreviewed`.
- [ ] Live data never shows MOCK badges; mock data always does.
- [ ] `npm run build`, `test:world-memory`, `test:look`, `test:stability` and `test:rescue` still pass.

Manual on Windows (needs the 8002 backend; Codex or the user runs it, not a GPU experiment for this handoff):
`ENGINE_TARGET=http://127.0.0.1:8002`. Start a world, walk, Save View, approve it, restore it, then
confirm the trail breaks and is coloured as a new segment. Reset and confirm the second break. Confirm the
displayed SHA verifies.
