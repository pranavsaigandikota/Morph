# Live Visual Memory Map: Frontend Contract (Feature 5)

Status: **PROPOSED contract v0.1**, additive to [API_CONTRACT.md](../API_CONTRACT.md) (World Memory API v1).
Cursor owns the UI. Endpoints marked PLANNED do not exist yet. Build against the MOCK fixtures in §7 until
the backend reports them as implemented in RESULTS.md.

Note on prior work: the requested `feature/worldshift-visual-memory-ui` branch was **not found** in this
clone or in the last-fetched remote refs. The only map-like component in `src/` is
`components/simulation/MapLegend.tsx`, which belongs to Rescue Mission's deterministic grid and must not be
reused for this map (§6). If Cursor has unpublished work, reconcile it against this document.

## 1. Compatibility rules

- No existing field or event changes meaning. New events extend the `MemoryEvent.type` union. New fields
  are optional.
- Memory events stay **JSON-only, best-effort, and never consume frame credits**. Only `type:"frame"`
  announces a following binary JPEG (unchanged).
- REST is authoritative. On reconnect, epoch change or a missed `event_seq`, refetch `GET /world/visual-memory`.
- Drop any event whose `session_id`, `world_id` or `epoch` is stale.

## 2. Evidence tagging (mandatory in the UI)

Every displayable value carries `evidence: 'measured' | 'estimated' | 'inferred' | 'reviewed' | 'mock'`.

| Evidence | Required visual treatment |
|---|---|
| `measured` | Normal rendering. Thumbnails show a small "RAW" chip |
| `estimated` | Trail and marker drawn with uncertainty halo/ellipse. Legend text: *"Estimated from your controls — not measured position"* |
| `inferred` | Dotted or dashed styling with a "match strength" label. Never solid lines between locations |
| `reviewed` | Check badge with reviewer note on hover |
| `mock` | Diagonal "MOCK" watermark on the whole map **and** on each mock thumbnail. Mock data cannot be shown without it |

Forbidden UI copy: "you are here (exact)", metres/feet/km, "GPS", "mapped", "scan", "same location"
(use "looks similar to an earlier view"), "collision", "walkable", "SLAM".

## 3. REST (PLANNED unless noted)

| Method / path | Response | Notes |
|---|---|---|
| `GET /world/memory?session_id=S` | EXISTING | Checkpoints, navigation, trajectory |
| `GET /world/visual-memory?session_id=S&since_event_seq=N` | `VisualMemorySnapshot` | Authoritative map state |
| `GET /world/observations?session_id=S&segment_id=G&limit=100&before=T` | `{observations: Observation[], next}` | Paged |
| `GET /world/observations/{id}?session_id=S` | `Observation` | |
| `GET /world/observations/{id}/image?session_id=S&variant=raw\|thumb` | JPEG / WebP | `raw` = byte-identical streamed JPEG; `Cache-Control: no-store` |
| `POST /world/observations/{id}/review` | `Observation` | `{session_id, approved, same_place_score?:1..5, link_id?}` |
| `POST /world/observations/{id}/promote` | `Checkpoint` (existing type) | Creates a restorable checkpoint from the same bytes and SHA-256 |
| `POST /world/calibration/start` / `GET /world/calibration` / `POST /world/calibration/cancel` | `CalibrationRun` | See CALIBRATION_WORKFLOW §10 |
| `GET /world/recovery/suggestions?session_id=S` | `{suspected:boolean, signals, anchors: AnchorSuggestion[]}` | Advisory only |

Restoration continues to use the EXISTING `POST /world/checkpoints/restore`.

## 4. Types

```ts
type Evidence = 'measured' | 'estimated' | 'inferred' | 'reviewed' | 'mock';

type EstimatedPose = {
  evidence: 'estimated'; units: 'estimated_units';
  x: number; z: number; yaw_rad: number; pitch_rad: number;
  sigma_xy: number;          // uncertainty radius in estimated_units; draw as halo
  sigma_yaw_rad: number;     // draw as heading wedge width
};

type Segment = {
  segment_id: string; epoch_start: number; started_at: string;
  anchor: { kind: 'world_start' | 'reset_to_seed' | 'checkpoint_restore' | 'calibration';
            checkpoint_id: string | null; thumb_url: string | null };
  previous_segment_id: string | null;   // provenance only
  geometric_continuity: 'none';         // ALWAYS 'none' across segments; never draw a trail edge between segments
};

type Observation = {
  observation_id: string; world_id: string; session_id: string; epoch: number; segment_id: string;
  frame_id: number | null; captured_at: string;
  capture_reason: 'calibration' | 'interval' | 'turn' | 'translate' | 'settle' | 'manual' | 'pre_restore';
  raw: { evidence: 'measured'; sha256: string; width: 1280; height: 720; image_url: string; thumb_url: string };
  estimated_pose: EstimatedPose;
  calibration: null | { calibration_id: string; intended_yaw_deg: number;   // INTENDED, not measured
                        verdict: 'ok' | 'mild_drift' | 'severe_drift' | 'degraded' | 'turn_ineffective' };
  analysis: { status: 'pending' | 'ready' | 'skipped_backpressure' | 'error'; evidence: 'inferred';
              quality_flag: 'ok' | 'degraded_suspected' | null;
              depth_cue: null | { ahead: 'appears_open' | 'appears_blocked' | 'unclear'; units: 'within_image_rank' } };
  checkpoint_id: string | null;
  review: { evidence: 'reviewed'; reviewed: boolean; approved: boolean | null };
};

type RevisitLink = {
  link_id: string; evidence: 'inferred' | 'reviewed';
  from_observation_id: string; to_observation_id: string;
  match_strength: number;                         // 0..1
  score_kind: 'heuristic_uncalibrated' | 'calibrated_to_human_judgement';
  cross_segment: boolean; direction: 'forward' | 'reverse';
  human_same_place: 1 | 2 | 3 | 4 | 5 | null;
};

type Localization = {
  evidence: 'inferred'; observation_id: string; segment_id: string; epoch: number;
  estimated_pose: EstimatedPose;
  hypothesis: 'continuing_same_area' | 'entering_new_area' | 'possible_revisit' | 'unknown';
  hypothesis_score: number; score_kind: RevisitLink['score_kind'];
  reasons: string[];                              // e.g. 'analysis_backlog', 'post_restore_grace'
};

type VisualMemorySnapshot = {
  world_id: string; session_id: string; epoch: number; event_seq: number;
  current_segment_id: string;
  segments: Segment[];
  trail: Array<{ segment_id: string; points: Array<Pick<EstimatedPose, 'x' | 'z' | 'yaw_rad' | 'sigma_xy'> & { t_ms: number; moving: boolean }> }>;
  observations: Observation[];                    // most recent ≤200; page older ones via REST
  links: RevisitLink[];
  calibration: CalibrationRun | null;
  localization: Localization | null;
  limits: { observations_per_world: number; used: number; quota_state: 'ok' | 'sparse' | 'full' };
  mock?: true;                                    // present ONLY in fixtures
};

type CalibrationRun = {
  calibration_id: string; mode: string; status: 'running' | 'completed' | 'completed_with_flags' |
    'aborted_drift' | 'aborted_quality' | 'aborted_turn_ineffective' | 'cancelled' | 'error';
  steps: Array<{ intended_yaw_deg: number; kind: 'capture' | 'return'; observation_id: string | null; verdict: string | null }>;
  turn_gain_source: 'human_estimate_from_probe' | 'nominal_constant';
};
```

New `MemoryEvent.type` values (payloads in brackets):
`observation_added` [`Observation`], `observation_updated` [`Observation`], `localization_update`
[`Localization`], `revisit_candidate` [`RevisitLink`], `segment_started` [`Segment`],
`calibration_progress` [`CalibrationRun`], `degradation_suspected` [`{signals, anchors}`],
`memory_quota` [`limits`].

## 5. Rendering rules

1. **Coordinate frames are per segment.** Each segment is drawn as its own "island" in its own colour.
   Islands are laid out side by side (or the non-current ones are faded). They are never overlaid as if
   they shared an origin. The current segment is centred on the player marker.
2. **Player marker**: a dot plus a heading wedge, with an uncertainty halo of radius `sigma_xy` and wedge
   half-width `sigma_yaw_rad`. The halo grows visibly as the player walks.
3. **Direction of travel**: an arrow from the last ~2 s of trail points. Hide it when `moving` is false.
4. **Trail of applied movements**: a polyline per segment, solid but with reduced opacity (estimated).
   **No edge connects two segments.** A restore is drawn as a dashed "↺ restored from" connector from the
   new island's origin to the anchor thumbnail, labelled with the anchor kind.
5. **Observation markers**: small squares at the observation's estimated pose. Hover shows the thumbnail
   (RAW chip), capture reason, time, quality flag and review state. Degraded observations are hollow and
   greyed.
6. **Checkpoint markers**: pins (existing checkpoints), with an approved/unreviewed state.
7. **Calibration views**: a fan of thumbnails around the segment origin, placed at **intended** headings
   and captioned "intended 90°". Return checks are shown as paired thumbnails with their verdict.
8. **Revisit links**: a dotted curve between the two observation markers with the label "looks similar
   (match strength 0.71)". Cross-segment links are drawn between islands, dotted only, with the caption
   "similar view in a different segment — not a path". A human review button ("same place? 1–5") sits on
   the link.
9. **Hypothesis chip** in the corner: *Continuing in a familiar-looking area* / *Likely new area* /
   *Looks like somewhere you've seen* / *Unsure (reason)*. Show the score with its `score_kind`.
10. **Legend** (always visible): RAW = real Waypoint frame · Estimated = from your controls · Inferred =
   from image similarity · Dashed = restore, not walking · MOCK = example data.

## 6. Not the Rescue Mission grid

- Use separate component and type namespaces, for example `src/components/memory-map/*` and
  `src/types/visualMemory.ts`. Do not import from `components/simulation/*` or `types/simulation.ts`.
- No grid cells, walls, hazards, exits or A* overlays. The memory map has no notion of obstacles or
  walkability.
- If both appear on one page, give them distinct titles: "Rescue grid (simulated)" vs "Exploration memory
  (estimated)".

## 7. MOCK fixtures

Fixtures must include `"mock": true` at the root and set `evidence:"mock"` on every value. Thumbnails must
be visibly watermarked placeholders, never real-looking scene images. The mock event sequence extends the
one in API_CONTRACT.md:

```
hello → frame/JPEG pairs → calibration_progress(running) ×5 → calibration_progress(completed)
→ segment_started(reset_to_seed) → navigation_update → observation_added ×N
→ localization_update(continuing) → localization_update(entering_new_area)
→ revisit_candidate(cross_segment:false) → localization_update(possible_revisit)
→ degradation_suspected → recovery_started → status(new epoch) → recovery_completed
→ segment_started(checkpoint_restore) → localization_update(unknown, reasons:['post_restore_grace'])
```

## 8. Acceptance checks for the UI (Cursor)

- [ ] No trail edge is drawn across `segment_id` boundaries (unit test on the layout function).
- [ ] Every marker, link and thumbnail renders its evidence styling. Mock data renders with the watermark.
- [ ] Stale-epoch events are ignored. The snapshot is refetched after `recovery_completed`.
- [ ] No unit strings other than "estimated units" appear in the map.
- [ ] The map keeps working when localization is `unknown` or analysis is `pending`.
- [ ] Map rendering never runs inside the frame decode/draw path: a separate component on its own
      ~2–5 Hz render cadence.
