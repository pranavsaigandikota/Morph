# Validation status

**Branch:** `cursor/game-experience-cd95` (draft PR #1). Keep `main` stable until merge gates pass.

**Adapter freeze:** Waypoint/SDXL client adapters awaiting Codex final tested patch — see [codex/ADAPTER_FREEZE.md](./codex/ADAPTER_FREEZE.md). Do not rewrite stream/scene/health adapters until that patch lands.

**UI-only (landed, freeze held):** Explorer help lists WASD + drag-look only; telemetry **Pres. Skips** / **Decode Err** / **Srv Drops** (server drops show unavailable until backend reports them).

## Mock vs real

| Track | Status |
|-------|--------|
| Phase-2 mock protocol | PASSED (`:4822`) |
| Frontend typecheck + build + rescue offline | PASSED |
| Codex Create Anything on Windows | Codex reports **~72 gen / ~18 disp FPS** sustained (~2 min) — frontend still awaits final adapter patch + `SCENE_API.md` |
| `SCENE_API.md` in this workspace | **MISSING** — copy required |
| Real Windows Create→Explore (this branch) | **PENDING** — required before merge to `main` |
| Rescue Mission (browser sim) | Offline PASS; Grok RescueEnv/RescueGame pending |
| AI Showdown | Verified rates in package (recorded) |

Do **not** claim frontend↔SDXL contract pass until `SCENE_API.md` is wired. Do not claim GPU pass from mock.

## Judging

[DEMO_GUIDE.md](./DEMO_GUIDE.md) · [PR_VALIDATION.md](./PR_VALIDATION.md)
