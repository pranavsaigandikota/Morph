# World Memory API Contract

**Status:** Checkpoint / estimated-navigation / raw-restore contract is published on
`feature/worldshift-spatial-memory-backend` (`docs/world-memory/API_CONTRACT.md` on that branch).

Frontend calibration integration reuses those routes without inventing capture endpoints.
See **`docs/ux/CALIBRATION_LIVE_CONTRACT.md`** for the Capture View → review → `/world/reset` mapping.

Until a non-mock GPU backend is attached:

- Typed models in `src/types/worldMemory.ts` and `src/types/checkpointApi.ts`
- Mock fixtures / mock engine routes remain explicitly `mock:true` / `source: mock_ui`
- Do **not** treat mock-engine checkpoint saves as `live_waypoint`

Enhancement endpoints and obstacle schema remain PLANNED / PROPOSED on the backend branch.
