# Obstacle schema compatibility report

**Frontend branch:** `feature/worldshift-visual-memory-ui`  
**Codex proposal:** `feature/worldshift-spatial-memory-backend` → `docs/world-memory/OBSTACLE_SCHEMA_PROPOSAL.md`  
**Frontend tip after reconcile:** pending commit on this branch  
**Live API:** **not activated** — proposal only; MOCK overlay remains opt-in and off by default.

## Matching fields (aligned in frontend DTOs)

| Codex proposal | Frontend (`src/types/worldMemory.ts`) |
|---|---|
| `obstacle_analysis.status` | `ObstacleAnalysisStatus` |
| `obstacle_analysis` job / models / latency | `job_id`, `model_revisions`, `latency_ms` |
| `source_image_sha256` (analysis + observation) | `source_image_sha256` |
| `observation_id` | `observation_id` |
| `source_checkpoint_id` | `source_checkpoint_id` |
| `label` | `label` |
| `bbox_normalized` | `[x0,y0,x1,y1]` |
| `direction.screen_x/screen_y/bearing_rad` | same; `bearing_rad` may be `null` |
| `relative_depth` rank object | `units: "within_image_rank"`, `confidence` nullable |
| `estimated_navigation` | optional; treated as approximate camera estimate |
| `estimated_position: null` | typed as `null` only |
| `detection_score` | `detection_score` |
| `review_status` | `unreviewed` \| … |
| `limitations[]` | `limitations` |

## Missing / deferred (await LIVE API)

| Item | Notes |
|---|---|
| Authoritative checkpoint GET | No live client yet |
| `checkpoint_updated` WS event | Not subscribed; stream adapters unchanged |
| Real SHA-256 of original bytes | MOCK uses deterministic faux hex; LIVE must use Codex hash of **raw** image |
| Model revision strings from runtime | MOCK placeholders only |
| Analysis job queue UX | Status enum ready; no enqueue API wired |
| Segmentation masks | Proposal notes detector boxes ≠ flood/path boundaries — UI does not invent masks |

## Unsupported UI assumptions removed

| Old frontend assumption | Fix |
|---|---|
| Invented `directionDeg` / map bearing | No bearing line unless `bearing_rad != null` |
| `relativeDistance` as map meters/units | Depth shown as **within-image rank** only; map uses screen-plane sketch offset |
| `kind: blocked\|hazard\|walkable` as geometry | Soft **suggestion tags** from labels; copy says unverified AI suggestion |
| Enhanced still as detection evidence | Bboxes/provenance drawn on **original** only; enhanced labeled presentation-only |
| Filling nulls in LIVE | LIVE path must leave null/missing; only MOCK fabricates observations |

## Changes required before LIVE integration

1. Codex implements + tests obstacle analysis behind default-disabled flag.  
2. Publish final schema in `API_CONTRACT.md` (not only the proposal).  
3. Frontend `LiveWorldMemoryClient` maps checkpoint GET → `obstacle_analysis` (no mock fallback in LIVE).  
4. Verify raw `source_image_sha256` matches original checkpoint bytes (never enhanced).  
5. Wire optional `checkpoint_updated` without breaking `display_ack` / JPEG stream.  
6. Keep “AI-Inferred Obstacles” toggle **off by default**.  
7. Human-review / `review_status` filtering if Codex requires it for demo.

## Separation

- **MOCK:** `MockWorldMemoryClient` + `mockObstacles.ts` only.  
- **LIVE:** absent until Codex activation — missing `obstacle_analysis` ⇒ overlay empty, no fabricated rows.
