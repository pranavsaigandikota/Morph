# Frontend integration status (Cloud)

**Branch:** `cursor/game-experience-cd95` → PR https://github.com/pranavsaigandikota/Morph/pull/1  
**Do not merge** until Windows GPU + RescueGame + SCENE_API gates pass.

## Assets expected on this branch (not yet present after `git pull`)

| Path | Purpose | Status in Cloud |
|------|---------|-----------------|
| `docs/codex/SCENE_API.md` | Authoritative SDXL Create Anything contract | **MISSING** |
| `docs/codex/CREATE_ANYTHING_DEMO.md` | Demo notes | **MISSING** |
| `docs/codex/CREATE_ANYTHING_RESULTS.md` | Codex measured results | **MISSING** |
| `integration/rescue-play/rescue_play.zip` | Validated Grok RescueGame + `INTEGRATION.md` | **MISSING** |
| Codex final frontend adapter patch | Stream / scene / health clients | **PENDING** (adapters frozen) |

Push or paste these into the branch; Cloud will pull and continue Priority 1–2 without inventing contracts or rewriting the simulator.

## Priority status

| Priority | Work | Status |
|----------|------|--------|
| 1 RescueGame | Wire package engine into `/mission` via `rescueEnvAdapter` | Blocked on zip |
| 2 Codex API | Apply tested adapter patch; match `SCENE_API.md` | Freeze held; blocked on docs + patch |
| 3 AI Showdown | Random / Guided PPO / A* verified rates + replays | **Preserved** — no invented 4th rate |
| 4 Quality | install / build / rescue / mock / routes | Runnable offline in Cloud |

## What Cloud can verify

- Frontend build, typecheck, lint warnings
- Mock Waypoint protocol (`:4822`)
- Rescue Mission offline package + browser sim tests
- AI Showdown static rates and replay pages without GPU
- Routes `/`, `/create`, `/world`, `/mission`, `/agents`, `/simulation`

## What Cloud cannot claim

- Real `:8000` Waypoint JPEG streaming / Gen FPS / Disp FPS
- Real SDXL Create Anything against the GPU backend
- Windows pointer-lock / WASD on live inference
- RescueGame parity until `rescue_play.zip` is in-repo
