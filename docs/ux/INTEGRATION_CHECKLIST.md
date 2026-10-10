# Integration checklist — LIVE calibration & visual memory

**UX tip (user-guided calibration):** `cursor/calibration-user-guided-cd95`  
**Prior polish freeze:** `cursor/worldshift-ux-polish-cd95` @ `535f02e`  

**Codex decision:** Automatic fixed-angle calibration is **NO-GO**. UI is user-guided Capture View only.

**Status:** No LIVE calibration wiring until Claude’s reviewed contract lands. Presentation queue unchanged pending Codex browser scheduling diagnosis — do not claim four-frame queue improved FPS.

Do **not** invent capture endpoints, hardcode camera angles, or treat browser screenshots as LIVE raw frames.

---

## Preserved frontend (do not regress)

| Surface | Keep |
|---|---|
| Explorer | Large 16:9 canvas, collapsible diagnostics, phase chips |
| Calibration | Optional MOCK `/calibrate` — **user-guided** Capture View; approve/reject/retake; Skip/Cancel; restore clean seed before explore |
| Memory | Estimated map + gallery (calibration / checkpoints / approved / rejected) |
| Labels | LIVE / MOCK / EXPERIMENTAL separation |
| Brand | Hugging Face attribution + model cards |
| Offline | Rescue Mission + AI Showdown unchanged |

Product visual target remains **native 1280×720 only** (`docs/PRODUCT_NATIVE_720P.md`).

---

## 1. Calibration state → backend events

| # | Check | Owner | Done when |
|---|---|---|---|
| 1.1 | Contract defines **user-guided** lifecycle: create → scan → capture* → review → **restore seed** → complete \| skip \| cancel | Claude | Reviewed DTO + state machine |
| 1.2 | Frontend maps UI phases 1:1 — no invented transitions; **no automatic fixed-angle turns** | Frontend | Adapter table in PR |
| 1.3 | Skip / Cancel emit explicit backend-acknowledged outcomes (or documented no-op) | Claude + Frontend | Contract + UI hook |
| 1.4 | Capture View requests current genuine Waypoint frame via verified API — never browser screenshot as proof | Codex + Frontend | Contract + acceptance |
| 1.5 | Suggested direction labels optional — not measured headings / not turn targets | Claude | Soft label enum |
| 1.6 | After calibration, restore original clean seed before explore (`/world/reset` or approved equivalent) | Codex + Frontend | Wired only after contract |

**UI today (MOCK only):** `src/types/calibration.ts`, `CalibrationFlow.tsx`, `mockCalibration.ts`.

---

## 2. Live frame capture and source provenance

| # | Check | Owner | Done when |
|---|---|---|---|
| 2.1 | Each capture carries `source` ∈ {`live_waypoint`, `sdxl`, …} — never implied | Claude | Required field |
| 2.2 | LIVE captures include original image SHA-256 (raw bytes, not enhanced) | Codex | Provenance in metadata |
| 2.3 | MOCK UI stills remain labeled `mock_ui` and never promoted to LIVE evidence | Frontend | Keep existing badges |
| 2.4 | Capture path uses verified Waypoint/seed APIs only — no silent frame substitution | Codex + Frontend | Acceptance test |
| 2.5 | Enhanced previews (if any) are separate URLs; analysis SHA stays on original | Claude | Matches obstacle proposal |

---

## 3. Checkpoint gallery DTO adaptation

| # | Check | Owner | Done when |
|---|---|---|---|
| 3.1 | Gallery items adapt from Claude DTO → existing UI fields (`id`, image, time, direction, review, confidence) | Frontend | Thin mapper only |
| 3.2 | `recoverySuitable` / reject reason come from backend or human review — not UI heuristics alone | Claude | Field in contract |
| 3.3 | Calibration views, saved observations, checkpoints, approved HQ anchors, rejected frames stay filterable | Frontend | `MemoryGallery` filters |
| 3.4 | AI-enhanced never shown as verified physical evidence | Frontend | Keep existing copy |
| 3.5 | Approved HQ starters retain seed, steps, SHA, model/revision for reproducibility | Frontend + Codex | Already in HQ path |

**UI today:** `MemoryGallery.tsx`, `CheckpointPreview.tsx`, `hqStarterCandidates.ts`.

---

## 4. Estimated navigation and uncertainty mapping

| # | Check | Owner | Done when |
|---|---|---|---|
| 4.1 | Pose `{x,y,heading,uncertainty,epoch}` semantics documented (units, origin, not geographic) | Claude | Contract section |
| 4.2 | Frontend maps LIVE pose into `EstimatedPose` without inventing meters | Frontend | Adapter |
| 4.3 | Uncertainty ring / compass use provided confidence only; null → “n/a” | Frontend | No fabricated scores |
| 4.4 | Calibration rays use contract bearings or null — not hardcoded angles from UI | Claude + Frontend | After Phase A0 |
| 4.5 | Copy remains “estimated / approximate / not physical” | Frontend | Preserve |

**UI today:** `ExplorationMap.tsx`, `Compass.tsx`, MOCK `mockWorldMemoryClient.ts`.

---

## 5. Restoration segment boundaries

| # | Check | Owner | Done when |
|---|---|---|---|
| 5.1 | Restore / refresh bumps `epoch` and marks trail discontinuity (`continuous: false`) | Claude + Frontend | Matches LIVE events |
| 5.2 | Unsuitable anchors cannot restore (UI already blocks `recoverySuitable === false`) | Frontend + Claude | Server enforce too |
| 5.3 | Refresh World continues to use existing `POST /world/reset` until a dedicated restore API is approved | Codex | No new endpoint without approval |
| 5.4 | Overlay states: preparing → reinitializing → complete \| failed | Frontend | `RestoreOverlay` |
| 5.5 | No claim of physical continuity across restore / fresh SDXL | All | Copy + docs |

---

## 6. Reconnect / reset handling

| # | Check | Owner | Done when |
|---|---|---|---|
| 6.1 | WS reconnect keeps same `session_id` / history per verified contract | Codex | Phase A0 + integration doc |
| 6.2 | Intentional disconnect / stop releases ownership; no orphan busy world | Frontend + Codex | Existing keepalive stop |
| 6.3 | Reset restores seed, advances epoch, clears presentation queue + look accumulators | Frontend | Existing `useWorldStream` |
| 6.4 | Calibration session identity tied to world/seed — reconnect does not invent a new cal without contract | Claude | Rules written |
| 6.5 | MEMORY MOCK client re-attaches on session/world change without claiming LIVE nav | Frontend | Preserve |

---

## 7. Native 720p stream rendering

| # | Check | Owner | Done when |
|---|---|---|---|
| 7.1 | Frame metadata reports ≥1280×720; UI flags below-target as non-product | Codex + Frontend | Telemetry “Native” row |
| 7.2 | Canvas keeps 16:9, object-contain, no stretch; responsive on 1366×768 and 1920×1080 | Frontend | Already in Viewer |
| 7.3 | Presentation queue + `display_ack` unchanged until Codex validates 720p wire notes | Frontend | Adapter freeze |
| 7.4 | No 360p selector, fallback, or demo mode | Frontend | Product rule |
| 7.5 | Gen/Disp FPS reported honestly; Disp FPS not claimed improved without Windows GPU measure | Codex + Frontend | Acceptance logs |

---

## 8. Real browser & Windows GPU acceptance criteria

Run on Windows with Codex Waypoint on **`:8000`** (preserve RescueGame / Showdown).

| # | Criterion | Pass |
|---|---|---|
| 8.1 | `/world` LIVE stream, native **1280×720**, Decode Err = 0 | ☐ |
| 8.2 | WASD + mouse-look for ≥60–120 s; Gen/Disp FPS near Codex Phase A0 baseline | ☐ |
| 8.3 | Phase A0 camera-turn test recorded (Codex) — frontend does not invent turn APIs beforehand | ☐ |
| 8.4 | Pause / Resume / Refresh World (`/world/reset`) / Disconnect behave per contract | ☐ |
| 8.5 | After Claude contract: LIVE calibration captures show real provenance + SHA; MOCK path still labeled | ☐ |
| 8.6 | Gallery restore blocked for unsuitable anchors; Start / approved SDXL restore OK when supported | ☐ |
| 8.7 | Map shows estimated pose only — no geographic/physical claims | ☐ |
| 8.8 | Rescue Mission five missions + Showdown rates unchanged | ☐ |
| 8.9 | No silent MOCK when `:8000` down; no silent LIVE when using `dev:mock` | ☐ |
| 8.10 | Frontend branch remains isolated — merge only after checklist sign-off | ☐ |

---

## Gate to unfreeze LIVE calibration wiring

```
[ ] Claude reviewed contract in-repo (API_CONTRACT / calibration section)
[ ] Codex Phase A0 camera-turn + native-720p playback notes published
[ ] Checklist §§1–7 owners agree adapter mapping
[ ] Windows acceptance §8 filled
[ ] Explicit “unfreeze” note on this branch (new commit) before LIVE adapter work
```

Until then: ship UI as MOCK/shell only; wait.

## Related docs

- `docs/ux/FRONTEND_UX_HANDOFF.md`  
- `docs/ux/API_QUESTIONS_FOR_CLAUDE.md`  
- `docs/ux/CODEX_HANDOFF.md`  
- `docs/PRODUCT_NATIVE_720P.md`  
- `docs/codex/ADAPTER_FREEZE.md`  
- `docs/world-memory/HQ_STARTER_APPROVAL.md`  
