# PR validation — `cursor/game-experience-cd95` → `main`

**PR:** https://github.com/pranavsaigandikota/Morph/pull/1 (draft — do not merge yet)

## Cloud / offline results (this agent)

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:mock-protocol` | PASS (explicit mock `:4822`) |
| `npm run test:rescue` | PASS (showdown rates + A* follow) |
| Routes `/` `/create` `/world` `/mission` `/simulation` `/agents` | HTTP 200 |
| Vite `/engine` → `:8000` when GPU down | **502** `engine_unreachable` (no silent mock) |
| Real SDXL / Waypoint on Windows `:8000` | **NOT RUN** — `ECONNREFUSED` from cloud |
| Grok Bot 1 `RescueEnv` + parity suite | **PENDING** — not in repo; seam at `rescueEnvAdapter.ts` |

## Verified showdown data (frozen package)

| Agent | Rates |
|-------|-------|
| Random | 19.5% / 8.0% |
| PPO + Path Guidance | 99.5% / 99.0% |
| A* | 100% / 100% |

Labeled `recorded_evaluation`; UI states not live inference; guided PPO note includes shortest-path access.

## Windows GPU checklist (required before merge)

Follow [WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md) + [DEMO_GUIDE.md](./DEMO_GUIDE.md):

1. SDXL: ≥2 distinct Create Anything worlds → Start Exploring
2. Waypoint: WASD, drag-look, pause, reset, reconnect, world switch
3. Record Gen FPS / Disp FPS / decode errors / drops vs prior baseline
4. Mission play + A* compare on facility_a
5. Drop in Grok `RescueEnv` behind `rescueEnvAdapter` + run their parity tests
6. Stop GPU: Mission / Showdown / Replays still work; Create/Explorer clear errors

## Outstanding risks

- Real FPS / decode / continuity unknown until Windows run
- SDXL path negotiation (`/scenes/generate` \| `/sdxl/generate` \| `/generate`) needs Codex confirmation
- Browser sim is schema-compatible placeholder until RescueEnv lands — do not treat as Grok parity pass
- Large JS bundle (Three.js) — acceptable for hackathon demo

## Merge gate

**Do not merge** until Windows GPU integration and RescueEnv compatibility are checked off above. Keep `main` at `a0924b6` (or current stable) as fallback.
