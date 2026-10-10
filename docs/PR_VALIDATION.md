# PR validation — `cursor/game-experience-cd95` → `main`

**PR:** https://github.com/pranavsaigandikota/Morph/pull/1 (draft — **do not merge** until gates below pass)

## Adapter freeze (coordinate with Codex)

See [codex/ADAPTER_FREEZE.md](./codex/ADAPTER_FREEZE.md). **Do not rewrite** stream envelope, scene-generation request body, or health probes until Codex lands its tested patch. Parallel work = Rescue UI + polish only.

## Blocker: Codex SCENE_API handoff not in workspace

Copy into `docs/codex/` (see [codex/README.md](./codex/README.md)):

- `SCENE_API.md` ← **required** to wire `/create` to the final SDXL contract (no guessing)
- `CREATE_ANYTHING_DEMO.md`
- `CREATE_ANYTHING_RESULTS.md`
- unzip `WorldShift-Create-Anything-Demo.zip` → `docs/codex/demo/`

## Codex-reported Windows baseline (Create Anything verified)

| Metric | Value |
|--------|-------|
| Generated FPS | **70.81** |
| Canvas / displayed FPS | **17.93** |
| Duration | 77.5 s |
| Transport / decode errors | **0** |
| Presets | 6 (incl. Florida hurricane neighborhood) |
| Inference backend | Preserved (do not replace) |

Frontend must meet or preserve this bar after `SCENE_API.md` integration; cloud agent cannot re-measure `:8000`.

## Cloud / offline results

| Check | Result |
|-------|--------|
| `npm run typecheck` / `build` | PASS |
| `test:mock-protocol` | PASS |
| `test:rescue` | PASS (showdown rates + A* follow) |
| GPU down → `/engine` | 502; Explorer **unavailable** (not MOCK) |
| World switch without React remount | Implemented (`switchWorld`) — needs Windows confirm on real seeds |
| Final `SCENE_API.md` client wiring | **PENDING** file copy |
| Grok `RescueEnv` / RescueGame adapter | **PENDING** handoff |
| Real SDXL 6 presets + 2 creative worlds | **PENDING** Windows + SCENE_API |

## Merge gate

Do **not** merge until:

1. `docs/codex/SCENE_API.md` integrated and `/create` uses that contract  
2. Windows GPU: Create → Explore with measured FPS near Codex baseline, 0 decode errors  
3. Rescue Mission gameplay + RescueEnv/RescueGame parity when available  
4. Full Create → Explore → Mission → Showdown journey on one Windows session  

Keep `main` as fallback.
