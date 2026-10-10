# World Memory UI — frontend handoff

**Branch:** `feature/worldshift-visual-memory-ui`  
**Base:** `4c64cf9` (Stability Mode tip on `cursor/explorer-look-stability-cd95`)  
**Codex contract:** `docs/world-memory/API_CONTRACT.md` — **PENDING**

## Implemented (Milestone A–B + mock restore)

| Feature | Status |
|---|---|
| Explorer shell: header → video → map → gallery | Live UI |
| Estimated compass + approximate trail map | **MOCK** nav |
| Checkpoint gallery + selection sync | **MOCK** images |
| Restore viewpoint UX + epoch break in trail | **MOCK** workflow |
| Save View | **MOCK** capture |
| Live Waypoint stream / WASD / drag-look / acks | Unchanged |
| HQ SDXL contact sheet + human approval gate | Wired on `/create` — needs Windows experimental HIGH API for real PNGs |
| Early Waypoint recovery anchors | **Rejected** in MOCK + UI (`recoverySuitable: false`) |
| Live WorldMemoryClient | Not started (await contract) |
| AI enhancement compare | MOCK candidates on some checkpoints |
| AI-Inferred Obstacles map overlay | MOCK, Codex-shaped DTO, toggle **off by default**; LIVE not wired |
| Schema reconcile | See `SCHEMA_COMPATIBILITY_REPORT.md` |
| HQ approval / comparison docs | `HQ_STARTER_APPROVAL.md`, `STARTER_COMPARISON_STATUS.md` |

## Honest labels

Copy uses: “Approximate trail”, “Est. heading”, “Remembered views”, “Restore viewpoint”, “continuity is approximate”. No geographic north claims.

## Windows steps (after Codex contract)

1. Keep backend on `:8000`  
2. `git checkout feature/worldshift-visual-memory-ui`  
3. Replace mock client with live adapter matching `API_CONTRACT.md`  
4. `npm.cmd ci && npm.cmd run build && npm.cmd run dev`  
5. Verify map/checkpoints against real events; do not leave MOCK badge on for demo if live.

## Tests

```powershell
npm.cmd run test:world-memory
npm.cmd run test:hq-starters
npm.cmd run test:look
npm.cmd run test:stability
npm.cmd run test:rescue
npm.cmd run build
# HQ contact sheet (GPU):
.\scripts\Generate-HqStarterContactSheet.ps1 -Prompt "<theme>" -Style cinematic
```

See `HQ_STARTER_APPROVAL.md` — do not start Waypoint from unapproved or Turbo-relabeled seeds.
