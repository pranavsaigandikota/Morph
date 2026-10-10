# Codex handoff — Frontend UX branch

**Branch:** `cursor/worldshift-ux-polish-cd95`  
**Repo:** https://github.com/pranavsaigandikota/Morph  

## Ask from Frontend

1. Keep production Waypoint on **`:8000`** (verified release). Do not require frontend to merge experimental spatial-memory backend yet.
2. When validating **native 1280×720**, publish the final integration contract (hello/frame dims, FPS baselines). Frontend already targets 720p presentation and flags sub-720p streams.
3. HQ SDXL contact sheet still needs experimental HIGH (`1280×720`, ~30 steps) on Windows — see `docs/world-memory/HQ_STARTER_APPROVAL.md`.
4. Do **not** change RescueGame / Showdown evaluation data from this UX branch.
5. Calibration captures are **frontend MOCK** until Claude + Codex agree on APIs — do not treat `/calibrate` stills as GPU evidence.

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
