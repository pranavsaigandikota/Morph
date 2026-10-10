# Visual Memory Data Model and Snapshot Capture (Features 2 and 3)

Status: **PROPOSED**. It extends, and does not replace, the implemented checkpoint store in
`experiments/backend/worldshift/memory.py`.

## 1. Two kinds of stored frames

| | **Checkpoint** (EXISTING) | **Observation** (PROPOSED) |
|---|---|---|
| Purpose | Restore anchor | Memory evidence: "what the player saw, roughly where" |
| Count | ≤ 32 per world | ≤ 600 per world (config) |
| Created by | Manual save, initial seed, 10 s periodic candidate | Calibration, interval/turn/translate/settle triggers, manual |
| Restorable | Yes (`/world/checkpoints/restore`) | No. It can be **promoted** to a checkpoint (same bytes, same SHA-256) |
| Storage | `world_memory/<world_id>/<cid>.raw` + `world.json` | `world_memory/<world_id>/obs/<oid>.jpg` + `memory.sqlite` |

Keeping them separate means the existing tested restore path and its 32-item quota stay as they are.
Promotion reuses `Memory.save(label, raw, meta, pose, provenance='raw_video_frame')`, which already
accepts explicit bytes, metadata and pose.

## 2. Storage layout

```
outputs/.../world_memory/
  <world_id>/
    world.json                  EXISTING checkpoint manifest (unchanged)
    <checkpoint_id>.raw         EXISTING raw checkpoint bytes
    memory.sqlite               PROPOSED observation index (WAL mode)
    obs/<observation_id>.jpg    PROPOSED raw JPEG bytes exactly as streamed (immutable)
    thumbs/<observation_id>.webp  derived 320×180 thumbnail (regenerable; carries source sha in DB)
```

"Raw" means the **byte-identical q85 4:4:4 JPEG** the service sent to clients (`encode()` in
`backend.py`). It is not the model's pre-encoding tensor. No re-encode, resize or enhancement ever
overwrites these bytes. Enhanced or derived images are separate files that reference the source SHA-256.

## 3. Schema

### 3.1 SQLite DDL (one database per world)

```sql
PRAGMA journal_mode=WAL;

CREATE TABLE segment (
  segment_id      TEXT PRIMARY KEY,          -- existing Navigation.segment_id
  world_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  epoch_start     INTEGER NOT NULL,
  started_at      TEXT NOT NULL,
  anchor_kind     TEXT NOT NULL CHECK (anchor_kind IN
                    ('world_start','reset_to_seed','checkpoint_restore','calibration')),
  anchor_checkpoint_id TEXT,                 -- for checkpoint_restore
  previous_segment_id  TEXT,                 -- provenance only; NOT a geometric connection
  geometric_continuity TEXT NOT NULL DEFAULT 'none'   -- always 'none' across segments
);

CREATE TABLE observation (
  observation_id  TEXT PRIMARY KEY,          -- 32-hex, opaque
  world_id        TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  epoch           INTEGER NOT NULL,
  segment_id      TEXT NOT NULL REFERENCES segment(segment_id),
  frame_id        INTEGER,                   -- MEASURED
  batch_id        INTEGER,                   -- MEASURED
  control_seq     INTEGER,                   -- MEASURED
  captured_at     TEXT NOT NULL,             -- MEASURED, UTC ISO
  server_elapsed_ms REAL NOT NULL,           -- MEASURED, monotonic
  capture_reason  TEXT NOT NULL CHECK (capture_reason IN
                    ('calibration','interval','turn','translate','settle','manual','pre_restore')),
  raw_path        TEXT NOT NULL,
  raw_sha256      TEXT NOT NULL,             -- MEASURED
  raw_bytes       INTEGER NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL,
  applied_controls_json TEXT NOT NULL,       -- MEASURED: batches since the previous observation
                                             -- [{batch_id, keys, mouse:[dx,dy], origin}]
  -- ESTIMATED (dead reckoning, arbitrary units)
  est_x REAL, est_z REAL, est_yaw REAL, est_pitch REAL,
  est_sigma_xy REAL,                         -- uncertainty radius, estimated_units
  est_sigma_yaw REAL,                        -- radians, nominal
  est_cumulative_movement REAL,
  -- calibration only
  intended_yaw_deg REAL, calibration_id TEXT, calibration_verdict TEXT,
  -- INFERRED (filled by analysis worker)
  analysis_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (analysis_status IN ('pending','ready','skipped_backpressure','error')),
  quality_json    TEXT,                      -- indicators + per-world relative scores + flags
  quality_flag    TEXT,                      -- 'ok'|'degraded_suspected'|'invalid_uniform'
  dhash64         INTEGER,
  embedding       BLOB,                      -- float16[384], L2-normalised
  embedding_model TEXT,                      -- e.g. 'facebook/dinov2-small@<revision>'
  depth_layout_json TEXT,                    -- optional 3x3 relative-rank grid, units 'within_image_rank'
  pan_px          REAL,                      -- phase-correlation pan vs previous observation
  -- links
  checkpoint_id   TEXT,                      -- if promoted, or saved from the same frame_id
  suppressed_duplicates INTEGER NOT NULL DEFAULT 0,
  -- REVIEWED
  reviewed        INTEGER NOT NULL DEFAULT 0,
  approved        INTEGER,                   -- NULL until reviewed
  reviewer_note   TEXT
);
CREATE INDEX obs_segment_time ON observation(segment_id, server_elapsed_ms);
CREATE INDEX obs_epoch ON observation(epoch);

CREATE TABLE observation_link (
  link_id     TEXT PRIMARY KEY,
  from_obs    TEXT NOT NULL REFERENCES observation(observation_id),
  to_obs      TEXT NOT NULL REFERENCES observation(observation_id),
  kind        TEXT NOT NULL CHECK (kind IN
                ('temporal_next','near_duplicate','revisit_candidate','calibration_return_check')),
  score       REAL,                          -- INFERRED similarity / sequence score (not a probability)
  detail_json TEXT,                          -- sequence length, margin, heading consistency, ...
  created_by  TEXT NOT NULL CHECK (created_by IN ('system','human')),
  human_same_place INTEGER                   -- NULL | 1..5 from human review
);

CREATE TABLE calibration_run (
  calibration_id TEXT PRIMARY KEY, world_id TEXT, session_id TEXT, epoch INTEGER,
  mode TEXT, started_at TEXT, finished_at TEXT,
  outcome TEXT, flags_json TEXT, config_json TEXT,   -- includes units_per_intended_45deg + its source
  negative_similarity_json TEXT                      -- distinct-heading cosine stats for thresholds
);

CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER);  -- bytes_used, dropped_queue, suppressed, ...
```

Embeddings are stored in SQLite for durability. At world load and on insert they are mirrored into an
in-memory `numpy` float16 matrix (`MemoryIndex`) for search.

### 3.2 Requirement checklist (Feature 2)

| Required field | Column(s) | Class |
|---|---|---|
| World and session identifiers | `world_id`, `session_id`, `epoch`, `segment_id` | MEASURED |
| Memory/observation ID | `observation_id` | — |
| Original screenshot | `obs/<id>.jpg` | MEASURED |
| Raw SHA-256 | `raw_sha256` | MEASURED |
| Capture timestamp | `captured_at`, `server_elapsed_ms` | MEASURED |
| Applied movement-control sequence | `applied_controls_json`, `control_seq` | MEASURED |
| Estimated position, yaw, pitch | `est_*` | ESTIMATED |
| Pose confidence / uncertainty | `est_sigma_xy`, `est_sigma_yaw` | ESTIMATED |
| Scene embedding | `embedding`, `embedding_model` | INFERRED |
| Visual-quality score | `quality_json`, `quality_flag` | INFERRED (indicators MEASURED) |
| Associated checkpoint | `checkpoint_id` | — |
| Navigation segment ID | `segment_id` → `segment` | — |
| Relationship to prior observations | `observation_link` | INFERRED / REVIEWED |
| Human-reviewed | `reviewed`, `approved`, `observation_link.human_same_place` | REVIEWED |

### 3.3 JSON shape returned by the API

```jsonc
{
  "observation_id": "9f…", "world_id": "…", "session_id": "…", "epoch": 3, "segment_id": "…",
  "frame_id": 4211, "capture_reason": "turn", "captured_at": "2026-10-10T19:02:11Z",
  "raw": { "sha256": "…", "bytes": 248113, "width": 1280, "height": 720,
           "image_url": "/world/observations/9f…/image?session_id=…&variant=raw",
           "thumb_url": "/world/observations/9f…/image?session_id=…&variant=thumb",
           "evidence": "measured" },
  "applied_controls": { "evidence": "measured", "batches": [ { "batch_id": 1043, "keys": ["w"], "mouse": [1.0, 0.0], "origin": "player" } ] },
  "estimated_pose": { "evidence": "estimated", "units": "estimated_units", "x": 3.1, "z": 7.4,
                      "yaw_rad": 0.62, "pitch_rad": -0.03, "sigma_xy": 1.9, "sigma_yaw_rad": 0.35 },
  "calibration": null,
  "analysis": { "status": "ready", "evidence": "inferred",
                "quality": { "flag": "ok", "indicators": { "luma_std": 41.2, "laplacian_variance": 812.0 },
                             "relative_to_world_baseline": { "laplacian": 0.74, "semantic_drift": 0.21 } },
                "embedding_model": "facebook/dinov2-small@<rev>", "depth_layout": null },
  "links": [ { "kind": "revisit_candidate", "to": "1c…", "score": 0.71, "human_same_place": null } ],
  "review": { "reviewed": false, "approved": null }
}
```

## 4. Bounded storage strategy

Defaults are sized for a hackathon on the existing Windows PC (64 GB RAM, local SSD). They are config
values, following the existing `WORLDSHIFT_*` environment-variable pattern.

| Limit | Default | Behaviour when reached |
|---|---|---|
| Observations per world | 600 (≈15–20 min at the default cadence) | At 80%: sparse mode (interval ×4, turn triggers only). At 100%: stop persisting non-calibration observations, emit `memory_quota`. **Never auto-delete raw evidence** |
| Observation raw bytes per world | 200 MiB | Same as above |
| Global memory root | 1 GiB across ≤8 world folders (existing folder cap) | The existing `507` on world start; archive manually |
| In-RAM embedding index | 600 × 384 × 2 B ≈ 0.45 MiB per world | Trivial |
| Capture queue (service process) | 4 items (each ≈ one JPEG, ~0.2–0.4 MB, estimate) | Drop oldest, increment `dropped_queue` |
| Analysis queue (to worker) | 8 items (paths only) | Mark `analysis_status='skipped_backpressure'`; file kept |
| Thumbnails | 320×180 WebP, ~10–20 KB (estimate) | Regenerable |

JPEG size per frame is an **estimate** to be measured in test T8. At 4:4:4 q85 for 1280×720, 150–400 KB is
plausible. Byte usage is a running counter in `counters`. The existing `save()` path globs every file on
each save, which becomes O(n) once hundreds of observations exist, so observation writes must not
call it.

## 5. Automatic snapshots while walking (Feature 3)

### 5.1 Triggers (evaluated in `Memory.batch`, O(1), no decode)

| Trigger | Default | Rationale |
|---|---|---|
| `interval` | every 2.0 s of *generating* time (1–10 s configurable) | Baseline coverage |
| `turn` | accumulated \|mouse_dx\| since the last observation ≥ units for ~30° (from the A0 probe; falls back to nominal 0.52 rad) | New viewpoint |
| `translate` | Δ `cumulative_movement` ≥ 1.5 estimated units | New area candidate |
| `settle` | input goes from non-zero to zero and stays at zero for 2 batches | Settled views are often clearest and best for retrieval |
| `pre_restore` | immediately before any restore or reset | Preserves the degraded evidence that triggered recovery |
| `manual` | user action | — |
| Global rate limit | ≥ 0.5 s between observations; skip while the lifecycle lock is held | Bounds load |

Paused or disconnected periods do not advance the triggers, matching the existing navigation rule.

### 5.2 Deduplication (before persisting, so raw evidence stays immutable)

1. Fast reduced decode: `PIL.Image.draft('L', (160, 90))` uses JPEG DCT scaling, costs about a millisecond
   and runs in `to_thread`.
2. dHash64. If Hamming ≤ 6 against any of the last 8 observations **in the same segment**, **and** no key
   input was applied in between, the frame is a duplicate. Do not persist it. Increment
   `suppressed_duplicates` on the matched observation.
3. After analysis, an embedding cosine ≥ 0.97 to an observation in the same segment within 10 s creates
   a `near_duplicate` link. The file is kept, because the rule is never to delete persisted evidence. The
   near-duplicate is excluded from the retrieval reference set.

Duplicates are only judged **within a segment and a short time window**. Across segments, visual sameness
is exactly what revisit detection must examine. It is not discarded as redundancy.

### 5.3 Degraded frames

`invalid_uniform` frames are rejected, as today. All other frames are kept. Frames below the world baseline
are flagged `degraded_suspected`: they are evidence for recovery evaluation, but they are excluded from
reference sets and anchor suggestions.

### 5.4 Pseudocode: observation capture

```python
class ObservationCapture:
    """Lives in the service process. batch() is called from the generation loop and must stay O(1)."""
    def __init__(s, store, worker, cfg):
        s.q = asyncio.Queue(maxsize=cfg.capture_queue)        # 4
        s.store, s.worker, s.cfg = store, worker, cfg
        s.last = TriggerState()                               # time, mouse accumulator, movement, idle batches
        s.pending_controls = deque(maxlen=64)                 # applied controls since the last observation

    # called from Memory.batch(), after Navigation.apply()
    def on_batch(s, jpeg, meta, keys, mouse, pose, origin, lifecycle_busy):
        s.pending_controls.append({'batch_id': meta['batch_id'], 'keys': keys, 'mouse': list(mouse), 'origin': origin})
        reason = s.last.update_and_check(meta['generated_at_ms'], keys, mouse, pose, s.cfg)  # pure arithmetic
        if reason is None or lifecycle_busy:
            return
        item = CaptureItem(jpeg, dict(meta), dict(pose), list(s.pending_controls), reason)
        s.pending_controls.clear()
        if s.q.full():
            s.q.get_nowait(); s.store.counter_inc('dropped_queue')   # drop the oldest MEMORY sample, never a video frame
        s.q.put_nowait(item)

    async def writer_loop(s):
        while True:
            item = await s.q.get()
            try:
                world = s.store.current_world()
                if world is None or item.meta['epoch'] != world.epoch:
                    continue                                       # stale epoch: discard
                if s.store.quota_state() == 'full' and item.reason not in ('calibration', 'pre_restore', 'manual'):
                    s.store.emit_once('memory_quota'); continue
                small = await asyncio.to_thread(fast_gray_160x90, item.jpeg)   # JPEG draft decode
                h = dhash64(small)
                dup = s.store.recent_same_segment(item.pose['segment_id'], n=8)
                match = next((o for o in dup if hamming(o.dhash64, h) <= 6), None)
                if match and not any(c['keys'] for c in item.controls):
                    s.store.inc_suppressed(match.observation_id); continue
                sha = hashlib.sha256(item.jpeg).hexdigest()
                oid = uuid4().hex
                path = await asyncio.to_thread(atomic_write, world.obs_dir / f'{oid}.jpg', item.jpeg)
                await asyncio.to_thread(s.store.insert_observation, oid, item, sha, h, path)  # analysis_status='pending'
                s.store.emit('observation_added', s.store.public(oid))       # JSON event, best-effort
                if not s.worker.submit_nowait({'oid': oid, 'path': str(path), 'sha': sha,
                                               'world_id': world.id, 'epoch': item.meta['epoch']}):
                    s.store.set_analysis_status(oid, 'skipped_backpressure')
            except Exception as e:
                s.store.counter_inc('capture_errors'); log.warning('capture failed: %s', e)
```

Analysis results return through `worker.results`. A consumer task verifies `world_id`/`epoch` and that
the file's SHA-256 still matches, writes the INFERRED columns, updates `MemoryIndex`, and then calls the
localizer (LOCALIZATION_ALGORITHM.md §7).

## 6. Session, epoch and world isolation

- All queries filter by `world_id` and the current `session_id`. Unknown or stale sessions return `404`,
  as today.
- Results for an old epoch are written to the DB (they are still evidence) but never trigger localization
  events for the current epoch.
- A new world (stop → start) gets a new DB. Cross-world retrieval is disabled. This prevents "revisits"
  between different generated worlds that merely share a theme.
- On process restart, archives stay on disk but sessions are not resumed. This is the existing behaviour.
