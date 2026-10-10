# Integration checklist — LIVE calibration & visual memory

**Integration branch:** `cursor/live-memory-integration` (from `cursor/calibration-user-guided-cd95` @ `7d0ea97`)  
**Contract:** `docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md` (docs/visual-spatial-memory @ 3151fae)  
**Backend:** `claude/live-memory-backend` @ `bc52c65` — World Memory API v1.1 on `:8002`  
**Phase A0:** NO-GO fixed-angle turning — guided manual calibration only  

**Status:** LIVE guided-calibration + memory adapter wired. Presentation queue unchanged (browser scheduling still open — no FPS claims). Rescue / Showdown / PPO untouched. Frozen: `useWorldStream.ts`, `worldApi.ts`, `engineConfig.ts`, `sceneGeneration.ts`.

Do **not** invent capture endpoints, hardcode camera angles, or treat browser screenshots as LIVE raw frames. `live_waypoint` only when capability gate passes and checkpoint save returns SHA.

---

## Preserved frontend (do not regress)

| Surface | Keep |
|---|---|
| Explorer | Large 16:9 canvas, collapsible diagnostics, phase chips |
| Calibration | MOCK shell preserved; LIVE overlay in Explorer when gate passes |
| Memory | LIVE REST polling + MOCK client via `VITE_WORLD_MEMORY_SOURCE` |
| Labels | LIVE / MOCK / unavailable separation — never silent switch |
| Brand | Hugging Face attribution + model cards |
| Offline | Rescue Mission + AI Showdown unchanged |

Product visual target remains **native 1280×720 only**.

---

## Automated results (this branch)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:live-mapping` | PASS (axes, segment breaks, stale epoch, pose-less skip, no `accept_unreviewed`/angles, capability gate, strict anchors) |
| `npm run test:calibration-ui` | PASS |
| `npm run test:world-memory` | PASS |
| `npm run test:look` | PASS |
| `npm run test:stability` | PASS |
| `npm run test:rescue` | PASS |
| `npm run test:mock-protocol` | PASS |
| Calibration acceptance never calls `/review` | Enforced in `liveCalibration.ts` (CLIENT review only) |
| MOCK vs LIVE badges | Capability gate + explicit `VITE_WORLD_MEMORY_SOURCE` |

---

## 1. Calibration state → backend events

| # | Check | Status |
|---|---|---|
| 1.1 | User-guided lifecycle | PASS — contract §4.1 + `LiveCalibrationOverlay` |
| 1.2 | No automatic fixed-angle turns | PASS — A0 NO-GO; soft prompts only |
| 1.3 | Skip before first capture = no backend; after ≥1 = `/world/reset` | PASS |
| 1.4 | Capture = `POST /world/checkpoints/save` + returned image | PASS |
| 1.5 | Soft labels, no angles | PASS |
| 1.6 | Exit via `POST /world/reset` | PASS |

---

## 2. Provenance

| # | Check | Status |
|---|---|---|
| 2.1 | `source: live_waypoint` only on LIVE path | PASS |
| 2.2 | SHA-256 + browser `crypto.subtle` verify | PASS |
| 2.3 | MOCK stays `mock_ui` | PASS |
| 2.4 | Calibration accept ≠ `/review` | PASS (§1A) |

---

## 3–7. Memory / map / restore

| Item | Status |
|---|---|
| Capability gate (model + memory_api + contract + 1280×720) | PASS |
| `LiveWorldMemoryClient` REST poll nav ~2 Hz / memory ~3 s | PASS |
| Mapping uiX=x, uiY=-z, headingDeg | PASS |
| Trail break on segment_id | PASS |
| Stale epoch discard | PASS |
| Checkpoint mapping + strict anchors | PASS |
| Anchor Approve/Reject → `/review` | PASS |
| Restore without `accept_unreviewed` | PASS |
| Refresh World = `/world/reset` | PASS |
| No angular cal rays; soft-label markers; pose-less skipped | PASS |
| Compass "Start"; confidence band heuristic; "estimated units" | PASS |
| Obstacles/enhancement MOCK off | PASS |
| Mock v1.1 parity routes | PASS (`server/mockMemoryV11.ts`) |

---

## §8 Windows GPU acceptance (:8002) — manual

Run (PowerShell):

```powershell
$env:VITE_WORLD_API_BASE_URL='http://127.0.0.1:8002'
$env:ENGINE_TARGET='http://127.0.0.1:8002'
$env:VITE_WORLD_MEMORY_SOURCE='live'
npm.cmd run dev
```

| # | Criterion | Pass |
|---|---|---|
| 8.1 | `/world` LIVE stream, native 1280×720 | ☐ Windows |
| 8.2 | WASD + mouse-look; report canvas FPS honestly (no improvement claims) | ☐ Windows |
| 8.5 | Guided cal forward/right/left/return; each capture "SHA verified" | ☐ Windows |
| 8.5b | Approve one SDXL seed anchor, restore it, Refresh World; two trail breaks + restored/reset markers | ☐ Windows |
| 8.8 | Rescue + Showdown unchanged | PASS (automated) |
| 8.9 | No silent MOCK when live requested | PASS (gate) |
| 8.10 | Branch isolated — merge only with approval | PASS |

---

## Gate status

```
[x] Reviewed LIVE contract in-repo
[x] Phase A0 NO-GO → guided manual only
[x] Minimal frontend adapter (no new capture endpoints)
[x] Automated tests green
[ ] Windows :8002 manual acceptance (operator)
[ ] Merge approval
```

## Related

- `docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md`
- `docs/world-memory/WORLD_MEMORY_API_V1.md`
- `docs/world-memory/visual-spatial/DOCUMENTATION_SOURCES.md`
- `docs/PRODUCT_NATIVE_720P.md`
