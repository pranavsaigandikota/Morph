# Documentation Sources (canonical index)

Created in revision 4 (2026-10-10) to resolve the duplicate `docs/world-memory/API_CONTRACT.md` path.

## The problem

Two different files share the path `docs/world-memory/API_CONTRACT.md`:

| Source | Content |
|---|---|
| `feature/worldshift-spatial-memory-backend` @ `ad71609` | **World Memory API v1**: the real backend wire contract (IMPLEMENTED/PLANNED status, routes, DTOs, events) |
| `feature/worldshift-visual-memory-ui` @ `0bf4f9b` (and Cursor branches based on it) | A 17-line **"PENDING" placeholder**. Not a contract |

A bare reference such as "see API_CONTRACT.md" is ambiguous, and it means different things depending on
the branch the reader is on.

## Rule

**Never cite `API_CONTRACT.md` by bare path.** Use one of these names, with a commit-pinned link:

| Canonical name | What it is | Pinned source |
|---|---|---|
| **LIVE Calibration and Visual-Memory Contract v1** | **Canonical** contract for LIVE guided calibration and visual memory (Cursor ↔ backend), with IMPLEMENTED / PROPOSED / BLOCKED tags | [`docs/visual-spatial-memory:docs/world-memory/visual-spatial/LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md`](LIVE_CALIBRATION_AND_MEMORY_CONTRACT.md) |
| **Backend World Memory API v1** | Backend wire contract the LIVE contract builds on | [`feature/worldshift-spatial-memory-backend@ad71609:docs/world-memory/API_CONTRACT.md`](https://github.com/pranavsaigandikota/Morph/blob/ad71609995c05199fe8951a74cc289b11dc0c4e7/docs/world-memory/API_CONTRACT.md) |
| Frontend contract placeholder | Placeholder only, **superseded** by the two above | [`feature/worldshift-visual-memory-ui@0bf4f9b:docs/world-memory/API_CONTRACT.md`](https://github.com/pranavsaigandikota/Morph/blob/0bf4f9b5317c8458e851d3e25a727e632d40a0eb/docs/world-memory/API_CONTRACT.md) |
| Backend results | GPU evidence for IMPLEMENTED status | [`feature/worldshift-spatial-memory-backend@ad71609:docs/world-memory/RESULTS.md`](https://github.com/pranavsaigandikota/Morph/blob/ad71609995c05199fe8951a74cc289b11dc0c4e7/docs/world-memory/RESULTS.md) |
| Obstacle schema proposal | PROPOSED obstacle DTO | [`feature/worldshift-spatial-memory-backend@ad71609:docs/world-memory/OBSTACLE_SCHEMA_PROPOSAL.md`](https://github.com/pranavsaigandikota/Morph/blob/ad71609995c05199fe8951a74cc289b11dc0c4e7/docs/world-memory/OBSTACLE_SCHEMA_PROPOSAL.md) |
| Cursor calibration requirements | Frontend requirements for user-guided Capture View | [`cursor/calibration-user-guided-cd95@7d0ea97:docs/ux/CALIBRATION_API_REQUIREMENTS.md`](https://github.com/pranavsaigandikota/Morph/blob/7d0ea974b44bb16b2dd4da38ab59c862b8ca8691/docs/ux/CALIBRATION_API_REQUIREMENTS.md) |
| Cursor integration checklist | Frontend gate; its §8 is aligned to `:8002` by the LIVE contract §8 | [`cursor/calibration-user-guided-cd95@7d0ea97:docs/ux/INTEGRATION_CHECKLIST.md`](https://github.com/pranavsaigandikota/Morph/blob/7d0ea974b44bb16b2dd4da38ab59c862b8ca8691/docs/ux/INTEGRATION_CHECKLIST.md) |
| Phase A0 turn-gain result | **NO-GO** for reliable fixed-angle turning (21 GPU trials, 3 scenes) | [`experiment/native720-turn-gain-a0@d7c7435:experiments/a0/PHASE_A0_TURN_GAIN_REPORT.md`](https://github.com/pranavsaigandikota/Morph/blob/d7c74350c4cfd0acc4e1021e5c70fa7527484b7a/experiments/a0/PHASE_A0_TURN_GAIN_REPORT.md) (published 2026-10-10; image evidence remains in local outputs) |
| **Backend World Memory API v1.1** (current backend) | Additive v1.1 API used by LIVE guided calibration; renamed file | [`claude/live-memory-backend@bc52c65:docs/world-memory/WORLD_MEMORY_API_V1.md`](https://github.com/pranavsaigandikota/Morph/blob/bc52c65/docs/world-memory/WORLD_MEMORY_API_V1.md) |

When a branch is updated, cite the new commit. Do not change an old pin in place.

## Recommended path fix at merge time (not done here)

This docs-only branch does not edit other branches. When the frontend and backend branches are merged:

1. Keep the backend file's content. Rename it to `docs/world-memory/WORLD_MEMORY_API_V1.md`, so the name
   says what it is, and update references.
2. Delete the frontend "PENDING" placeholder rather than merging it.
3. Point both branches' READMEs at this index, or at the renamed file plus the LIVE contract.

Until then, the source-qualified names above are authoritative (Codex item K8).
