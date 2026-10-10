# Adapter freeze status

**Lifted for merge of `integration/codex-grok-handoff` @ `7e6bcd1`.**

Codex’s verified adapters are now on `cursor/game-experience-cd95`. Do **not** independently rewrite:

- `src/hooks/useWorldStream.ts`
- `src/services/sceneGeneration.ts`
- `src/services/worldApi.ts`
- `src/services/engineConfig.ts`

unless a new Codex-tested patch arrives. UI-only Explorer help/telemetry labels and Rescue Mission discrete controls remain fair game.

Authoritative contracts: [SCENE_API.md](./SCENE_API.md), [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md), [HANDOFF.md](./HANDOFF.md).

## Native 720p product freeze (2026-10-10)

Product is **1280×720 only** — see [PRODUCT_NATIVE_720P.md](../PRODUCT_NATIVE_720P.md).

Until Codex publishes the **final validated 720p integration contract**:

- Do **not** merge experimental backend changes as authoritative
- Do **not** rewrite stream adapters for unvalidated 720p wire prototypes
- Presentation defaults, telemetry resolution rows, and HQ SDXL 1280×720 starters **may** align to 720p now
- Do **not** add a 360p selector, fallback, or demo mode
- Old Git releases remain for recovery only, not product features

Rescue Mission, AI Showdown, and unrelated UI remain in scope for normal work.
