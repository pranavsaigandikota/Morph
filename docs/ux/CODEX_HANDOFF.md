# Codex handoff — Frontend UX branch

**Branch:** `cursor/worldshift-ux-polish-cd95`  
**Frozen tip:** `535f02e` (UI freeze; docs-only updates allowed)  
**Repo:** https://github.com/pranavsaigandikota/Morph  

## Freeze notice

Frontend UX is **frozen** pending:

1. Claude’s **reviewed** calibration + visual-memory API contract  
2. Codex **native-720p GPU playback** + **Phase A0 camera-turn** results  

Do not expect LIVE calibration adapters from this branch until `docs/ux/INTEGRATION_CHECKLIST.md` is signed off.

## Ask from Frontend

1. Keep production Waypoint on **`:8000`** (verified release). Do not require frontend to merge experimental spatial-memory backend yet.
2. Complete Phase A0 camera-turn testing; publish notes. Frontend will **not** hardcode turn angles or invent turn APIs beforehand.
3. When validating **native 1280×720**, publish the final integration contract (hello/frame dims, FPS baselines). Frontend already targets 720p presentation and flags sub-720p streams.
4. HQ SDXL contact sheet still needs experimental HIGH (`1280×720`, ~30 steps) on Windows — see `docs/world-memory/HQ_STARTER_APPROVAL.md`.
5. Do **not** change RescueGame / Showdown evaluation data from this UX branch.
6. Calibration captures are **frontend MOCK** until Claude + Codex agree on APIs — do not treat `/calibrate` stills as GPU evidence.

## Safe to smoke on Windows

```powershell
git fetch origin
git checkout cursor/worldshift-ux-polish-cd95
git pull
npm.cmd ci
# Codex already on :8000
npm.cmd run dev
# http://127.0.0.1:4821/create → Calibrate & Explore (or Skip)
# http://127.0.0.1:4821/world → Diagnostics collapsed; Refresh World = existing reset
```

Explicit mock (cloud/CI): `npm.cmd run dev:mock`

## Out of scope for Codex from this PR

- Inventing calibration HTTP routes to match the MOCK UI
- Merging `feature/worldshift-spatial-memory-backend` into frontend
- Claiming Disp FPS improvements without GPU measurement
