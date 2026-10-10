# World Memory API Contract

**Status:** PENDING — Codex owns this document.

Until Codex publishes the authoritative schema, the frontend uses:

- Typed models in `src/types/worldMemory.ts` (provisional)
- Mock fixtures in `src/services/worldMemory/mockFixtures.ts`
- `MockWorldMemoryClient` clearly labeled `source: "mock"`

Do **not** treat provisional field names or paths as production contracts.

When Codex lands the real contract here:

1. Frontend adapts `WorldMemoryClient` only
2. Mock remains available behind an explicit flag
3. No invented endpoints ship as “live”
