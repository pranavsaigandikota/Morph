# API questions for Claude — status

Frontend user-guided calibration now reuses spatial-memory checkpoint + reset APIs. See `CALIBRATION_LIVE_CONTRACT.md`.

| # | Question | Status |
|---|---|---|
| 1 | Capture current view + SHA? | **Resolved** — `POST /world/checkpoints/save` |
| 2 | Session lifecycle events? | **Resolved** — client-local phases; skip/cancel documented no-op on backend |
| 3 | Optional labels not commanded yaw? | **Resolved** — soft `label` string only |
| 4 | Seed restore = `/world/reset`? | **Resolved** — yes (not checkpoints/restore) |
| 5 | Map coordinates / epoch on restore? | Open for map UI — reset advances epoch; new segment |
| 6 | Recovery anchors / SHA / review? | Checkpoint `quality` + SHA; HQ starter policy separate |
| 7 | Obstacles LIVE DTO? | Still PROPOSED — out of calibration scope |
| 8 | Confidence scores? | Stay `null` on client until verified |
| 9 | 720p hello/frame fields? | Product native 1280×720; see `PRODUCT_NATIVE_720P.md` |

Related: `docs/PRODUCT_NATIVE_720P.md`.
