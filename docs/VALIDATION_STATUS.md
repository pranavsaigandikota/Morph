# Validation status

**Branch:** `cursor/game-experience-cd95` (draft PR #1). Keep `main` stable until merge gates pass.

## Mock vs real

| Track | Status |
|-------|--------|
| Phase-2 mock protocol | PASSED (`:4822`) |
| Codex Create Anything on Windows | Codex reports **70.81 gen / 17.93 canvas FPS**, 0 decode errors — frontend must integrate `SCENE_API.md` ([codex/README.md](./codex/README.md)) |
| `SCENE_API.md` in this workspace | **MISSING** — copy required |
| Rescue Mission (browser sim) | Offline PASS; Grok RescueEnv/RescueGame pending |
| AI Showdown | Verified rates in package (recorded) |

Do **not** claim frontend↔SDXL contract pass until `SCENE_API.md` is wired. Do not claim GPU pass from mock.

## Judging

[DEMO_GUIDE.md](./DEMO_GUIDE.md) · [PR_VALIDATION.md](./PR_VALIDATION.md)
