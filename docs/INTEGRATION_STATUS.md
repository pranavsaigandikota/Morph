# Frontend integration status

**Branch:** `cursor/game-experience-cd95` → PR https://github.com/pranavsaigandikota/Morph/pull/1  
**Do not merge** without approval + Windows release check.

## Sources integrated

| Source | Commit / artifact | Status |
|--------|-------------------|--------|
| Codex adapters | `integration/codex-grok-handoff` @ `7e6bcd1` | Merged; do not rewrite |
| Rescue Play v1 | `integration/rescue-play-v1` @ `6a01103` | ZIP SHA `51c463fe…` vendored |
| Controller | `createStepController` (t17u) | Wired on `/mission` |
| Showdown / PPO package | `public/data/rescue/` | Untouched |

## Cloud verification

- Production `build` / `typecheck`
- Frontend `test:rescue` (controller contract + 5 missions + showdown rates)
- Package vitest: **208 passed** (from unzipped rescue_play)
- `test:mock-protocol` (offline mock — not GPU)
- Browser Playwright controls vs live `/mission`
- Routes `/create` `/world` `/mission` `/agents` `/simulation` → 200

## Outstanding

- **Physical hold-key** still needs a human check on Windows (per BROWSER_VALIDATION.md).
- Combined-branch **real `:8000` GPU** Create→Explore re-confirm (Codex 218.49s evidence is for the adapter patch).
- Optional: unguided PPO fourth Showdown column when that separate ZIP is requested.
