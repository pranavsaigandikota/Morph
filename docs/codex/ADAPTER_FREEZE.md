# Adapter freeze status

**Lifted for merge of `integration/codex-grok-handoff` @ `7e6bcd1`.**

Codex’s verified adapters are now on `cursor/game-experience-cd95`. Do **not** independently rewrite:

- `src/hooks/useWorldStream.ts`
- `src/services/sceneGeneration.ts`
- `src/services/worldApi.ts`
- `src/services/engineConfig.ts`

unless a new Codex-tested patch arrives. UI-only Explorer help/telemetry labels and Rescue Mission discrete controls remain fair game.

Authoritative contracts: [SCENE_API.md](./SCENE_API.md), [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md), [HANDOFF.md](./HANDOFF.md).
