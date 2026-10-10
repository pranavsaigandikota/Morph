# Adapter freeze — coordinate with Codex

**Do not rewrite these files until Codex delivers its tested patch** against the accepted Waypoint backend:

| File | Reason |
|------|--------|
| `src/services/waypointEnvelope.ts` | Binary frame-envelope format |
| `src/hooks/useWorldStream.ts` | Streaming session / control protocol (except UI-only helpers like `switchWorld` presentation) |
| `src/services/sceneGeneration.ts` | Scene API request body (no invented width/height) |
| `src/services/engineConfig.ts` | Stream URL / base origin |
| `src/services/worldApi.ts` | Health / readiness probe assumptions |
| `docs/WAYPOINT_PROTOCOL.md` | Must match Codex-accepted contract after patch |

## Confirmed mismatches (Codex)

- Streaming endpoint / session protocol
- Binary frame-envelope format
- Unsupported `width`/`height` in scene-generation requests
- Incorrect health-check readiness assumptions

## Safe parallel work (this branch)

- Rescue Mission / Showdown / Replays UI (static package + browser sim)
- Visual polish on Landing / Mission / Showdown
- Explorer **help copy** and telemetry **labels** (e.g. Presentation Skips) — not wire protocol
- `docs/codex/` handoff + validation docs
- `src/services/rescueEnvAdapter.ts` / `browserRescueSim.ts` (until Grok RescueGame lands)

Still **do not** change control message shapes, envelope parsing, scene POST bodies, or health probes.

## Integration order when Codex patch arrives

1. Apply Codex patch exactly (prefer their diff over ours on the frozen files).
2. Re-run `npm run build`, `test:mock-protocol`, `test:rescue`.
3. Windows GPU: Create Anything + Explore vs Codex baseline (70.81 / 17.93 FPS).
4. Then merge draft PR #1 → `main`.

Inference backend remains Codex-owned — never replace or overwrite it from this frontend repo.
