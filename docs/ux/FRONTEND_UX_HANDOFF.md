# Frontend UX handoff — World Explorer polish & calibration shell

**Branch:** `cursor/worldshift-ux-polish-cd95`  
**Frozen tip:** `535f02e` (+ docs freeze commit)  
**Base:** `feature/worldshift-visual-memory-ui` @ `0bf4f9b`  
**Owner:** Lead Frontend UX (Cursor)  
**Architecture:** Claude · **GPU / backends:** Codex  

## FREEZE

**Temporarily frozen** while Claude reconciles the live calibration / visual-memory contract and Codex finishes native-720p GPU playback + Phase A0 camera-turn testing.

- No new UI features on this branch during the freeze.  
- No speculative backend calls or hardcoded camera angles.  
- No LIVE calibration wiring until the gate in `INTEGRATION_CHECKLIST.md` clears.  
- Keep the branch **isolated** — do not merge to `main`.  

Integration worklist: **[INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)**.

Product visual target remains **native 1280×720 only**.

## What shipped (UI)

| Priority | Deliverable | Status |
|---|---|---|
| 1 Explorer polish | Prominent 16:9 canvas, collapsible diagnostics, phase chips, Refresh World | Done |
| 2 Calibration | Optional MOCK flow `/calibrate` (quad now, 8 dirs reserved) + Skip | Done (MOCK) |
| 3 Memory map | Est. pose/heading, cal rays, trail breaks, uncertainty, unsuitable markers | Done (MOCK nav) |
| 4 Recovery UX | Refresh World + transition overlay + restore selection policy | Done (existing `/world/reset`) |
| 5 Gallery | Unified calibration / checkpoints / approved HQ / rejected | Done |
| 6 Hugging Face | Attribution + model cards; LIVE vs EXPERIMENTAL labels | Done |

## MOCK vs LIVE

| Feature | Mode |
|---|---|
| Waypoint JPEG stream | LIVE when `:8000` up; MOCK via `npm run dev:mock` |
| Calibration captures | **MOCK UI** SVG stills — not live Waypoint frames |
| Exploration map pose/trail | **MOCK** until Claude/Codex contract |
| Obstacle overlay | **MOCK**, off by default |
| HQ SDXL contact sheet | LIVE only on experimental HIGH API (Windows) |
| Rescue / Showdown / Simulation | Unchanged static / offline |

## Files (primary)

- `src/components/world/WorldViewer.tsx`, `PerformanceOverlay.tsx`
- `src/components/worldMemory/*` (shell, map, restore, gallery, header)
- `src/components/calibration/CalibrationFlow.tsx`
- `src/pages/CalibrationPage.tsx`
- `src/services/calibration/mockCalibration.ts`
- `src/types/calibration.ts`
- `src/components/brand/HuggingFaceAttribution.tsx`
- `src/data/huggingFaceModels.ts`
- `docs/ux/FRONTEND_UX_HANDOFF.md`, `docs/ux/API_QUESTIONS_FOR_CLAUDE.md`, `docs/ux/CODEX_HANDOFF.md`

## Tests

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:calibration-ui
npm.cmd run test:hq-starters
npm.cmd run test:world-memory
npm.cmd run test:look
npm.cmd run test:stability
npm.cmd run test:rescue
npm.cmd run test:mock-protocol
```

Cloud cannot claim live GPU FPS validation.

## Intentionally not done

- No calibration camera turning / no invented calibration API
- No stream adapter rewrite; no 360p mode
- No RescueGame / Showdown / PPO edits
- No merge of `feature/worldshift-spatial-memory-backend`
