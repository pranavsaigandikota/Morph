# FREEZE: Rescue Play engine and simulation mechanics

**Status: FROZEN** as of this package (`@worldshift/rescue-play` 0.1.0, control contract t17u, 2026-10-10).

The engine and simulation mechanics are frozen. This covers step rules, rewards, collision/hazard/goal/timeout
handling, reward rounding, scenario validation, A\*, action parsing, the play layer and the input controller.
They reproduce the frozen Python `rescue_sim` simulator exactly.

**Any change** to a file listed below requires all of the following:

1. `npm test`: all **208** tests must pass (176 engine/parity/game + 13 controls + 19 hold-controls).
2. `npm run parity` with `RESCUE_SIM_PYTHON` pointing at a Python with `rescue_sim` installed. It must print
   `PARITY OK` (Python→TS 153 cases / 17,842 steps, TS→Python 555 runs / 40,846 steps, 0 mismatches).
3. Regenerating `reports/engine_freeze.json` and this file, and recording the reason for the change.

Gameplay presentation (the frontend renderer, styling, copy) is not frozen. It must use the public API
and must not re-implement rules.

Machine-readable copy: [`reports/engine_freeze.json`](reports/engine_freeze.json).

## Source files (sha256)

| file | sha256 |
|---|---|
| `src/env.ts` | `645317bbaa4a72e6d746503e0cfd2627bc70a18cfe28a618fa98e2fd3a1d2b86` |
| `src/game.ts` | `b48a7d6870297efddd35a858a430b6fc4d51e827f47f15aa7aa28d74edf50e2e` |
| `src/astar.ts` | `7316671e0cc1eccdba0e4d0a13fef660695551338f84afabe053f34aef6d729a` |
| `src/scenario.ts` | `8f84a001e11449a70800fb1bbb7a08d09691b9e65b0475ec3de20cb6400219b3` |
| `src/actions.ts` | `6edb42013730d08b58ffc707b9ea1430df3bd73c73f4c16551f49d1592442eab` |
| `src/pyround.ts` | `7bcd6d3d754f33dadbae967a7948fb6df9ecd98c23e4f270d76f3092ea6964e1` |
| `src/pyrepr.ts` | `6506bd7d9c21e12691ef5e9265c8afed00a882420f9ddd30ae0b26b67340a340` |
| `src/controls.ts` | `3ef1f2b7dc514389d89bfa97334fe6b7ef198043c6938ad970c2794c5e0b9ac7` |

## Directories

Aggregate = sha256 of the concatenated lines `<sha256>  <relative path>\n` for every file in the directory, sorted by path.
Per-file hashes are in `reports/engine_freeze.json`.

| directory | files | aggregate sha256 |
|---|---|---|
| `dist/` | 18 | `8fd0b085e99c645c7096e8ae9c659a965cb4718284229ac8094c662b8bc45cfc` |
| `missions/` | 6 | `907008b60a97531a3d06588b9504ad939832d737e7f9671f2da78f28647bc256` |
| `data/` | 11 | `95ad196e08312fee9f63f99aaf67f1c27802d297824bc4770e668625d6129fe6` |

## Verify

```sh
sha256sum src/env.ts src/game.ts src/astar.ts src/scenario.ts src/actions.ts src/pyround.ts src/pyrepr.ts src/controls.ts
# directory aggregate (example: dist)
find dist -type f | LC_ALL=C sort | xargs sha256sum | sha256sum
```

Verification at freeze: 208 passed (4 files); PARITY OK: Python->TS 153 cases / 518 sequences / 17,842 steps; TS->Python 555 runs / 40,846 steps; 0 mismatches.
