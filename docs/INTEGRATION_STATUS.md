# Frontend integration status

**Branch:** `cursor/game-experience-cd95` → PR https://github.com/pranavsaigandikota/Morph/pull/1  
**Handoff base:** `integration/codex-grok-handoff` @ `7e6bcd1`  
**Do not merge** until Windows release check on the combined branch.

## Merged / wired

| Asset | Status |
|------|--------|
| Codex stream/scene/health adapters | Merged from handoff (preserve — do not rewrite) |
| `docs/codex/SCENE_API.md` + FRONTEND_INTEGRATION + 218s report | In branch |
| `integration/codex-presets/` (6 SDXL PNG + metadata) | In branch; Create page shows local previews |
| RescueGame `src/lib/rescue-play` + `public/data/rescue-play` | Wired to `/mission` |
| Explorer help (WASD + drag-look only) | Kept |
| Telemetry Pres. Skips / Decode Err / Srv Drops | Kept |
| AI Showdown verified rates | Untouched |

## RescueGame controller note

`rescue_play.zip` ships RescueGame + INTEGRATION.md one-step `keydown` demo (parity fixtures; game/parity vitest files).  
It does **not** include a separate **189-test hold-to-move controller** package.  
`/mission` therefore uses documented **one step per keypress** (+ D-pad, Restart, Undo) — not invented hold-to-move. If Grok publishes the newer controller ZIP, swap it in without changing RescueEnv step rules.

## Cloud vs GPU

Cloud: build, mock protocol, RescueGame offline (5 missions), Showdown static, routes.  
**Not claimed from Cloud:** real `:8000` Gen/Disp FPS. Codex 218.49 s evidence covers the adapter patch; combined branch still needs local Windows release testing ([WINDOWS_REAL_GPU.md](./WINDOWS_REAL_GPU.md), [HANDOFF.md](./codex/HANDOFF.md)).
