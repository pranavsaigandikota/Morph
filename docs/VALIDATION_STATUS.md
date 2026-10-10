# Validation status

**Branch note:** Game-experience work lives on `cursor/game-experience-cd95` until merged. Keep `main` stable for demos that must not move.

## Mock vs real

| Track | Status |
|-------|--------|
| Phase-2 mock protocol (`npm run test:mock-protocol`) | PASSED on mock `:4822` |
| Real Waypoint GPU `:8000` | Pending on Windows PC ([WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md)) |
| SDXL Create Anything | Wired to Codex scene endpoints; requires `:8000` / `VITE_SCENE_API_BASE_URL` |
| Rescue Mission (browser sim) | Works offline from `public/data/rescue/` |
| AI Showdown verified rates | Shipped in `eval_verified_showdown.json` (19.5/8 · 99.5/99 · 100/100) |

Do **not** claim GPU integration from mock tests. Do **not** claim showdown rates are live inference.

## Judging

See [DEMO_GUIDE.md](./DEMO_GUIDE.md) for the 3-minute interactive path.
