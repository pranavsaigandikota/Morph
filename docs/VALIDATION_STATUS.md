# World Explorer — mock vs real-backend validation

**Do not claim real GPU integration from mock results.**

| Track | Status | Where |
|-------|--------|--------|
| Protocol implementation (Phase-2 client) | Code complete | `src/services/waypointEnvelope.ts`, `useWorldStream.ts` |
| Mock protocol (cloud / CI) | Runnable via `npm run test:mock-protocol` | `:4822` only when explicitly started |
| Real Codex Waypoint GPU | **Pending on Windows PC** | `:8000` — see [WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md) |
| Codex `FRONTEND_INTEGRATION.md` reconcile | **Waiting for docs** | Compare to [WAYPOINT_PROTOCOL.md](./WAYPOINT_PROTOCOL.md) |

## Requirement coverage

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Phase-2 `/stream` + binary JPEG envelopes + control + frame meta | Done in code |
| 2 | Strict LIVE vs MOCK labeling | Done — hello.`mock` / engine name; failed probe ≠ MOCK |
| 3 | `VITE_WORLD_API_BASE_URL` default `http://127.0.0.1:8000` | Done (`.env.example`) |
| 4 | No silent mock fallback when `:8000` down | Done (`scripts/dev.mjs` + UI error + `npm run dev:mock`) |
| 5 | Windows WASD / mouse / 60s real test | **Held open** — run [WINDOWS_VERIFY.md](./WINDOWS_VERIFY.md) |
| 6 | Clonable `npm install` && `npm run dev` | Done |
| 7 | Rescue Lab static package independent of Waypoint | Done (`public/data/rescue/`) |

## A. Mock mode results (this cloud environment)

Run only with an **explicit** mock:

```bash
npm run mock
# other terminal:
ENGINE_URL=http://127.0.0.1:4822 npm run test:mock-protocol
DURATION_MS=15000 ENGINE_URL=http://127.0.0.1:4822 npm run test:stream60
```

| Check | Result |
|-------|--------|
| Envelope LE JPEG batch parse | Implemented + mock-tested previously |
| Control `{type,buttons,dx,dy,scroll,ts}` | Implemented |
| `hello.mock === true` / MOCK UI | Implemented |
| Auto-start mock when `:8000` down | **Removed** (by design) |

Mock FPS numbers are **not** GPU acceptance metrics.

## B. Real Codex Waypoint (`127.0.0.1:8000`) — NOT PASSED HERE

| Check | Status in cloud VM | Status on your Windows PC |
|-------|--------------------|---------------------------|
| Connect `VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000` | Unreachable (connection refused) | Pending |
| LIVE banner / no MOCK badge | N/A | Pending |
| Real JPEG frames on canvas | N/A | Pending |
| WASD changes pixels | N/A | Pending |
| Pointer-lock mouse changes pixels | N/A | Pending |
| 60s continuous interaction metrics | N/A | Pending (`npm run test:stream60`) |
| Gen FPS / Disp FPS / latency / gaps / decode errors | N/A | Pending — record from UI + harness |
| Pause / reset / reconnect | N/A | Pending |
| Rescue Lab with Waypoint stopped | Static `manifest.json` 200 verified in cloud | Pending re-check on PC |

## C. Protocol doc reconcile

Compared client + `docs/WAYPOINT_PROTOCOL.md` against public Phase-2 reference (`Gxmestk/overworld-waypoint-1.5` envelope + `WS /stream` + control). Wire format matches.

**Still waiting** for Codex’s authoritative `FRONTEND_INTEGRATION.md` / verification ZIP from `Codex Plus`. On receipt: diff against `WAYPOINT_PROTOCOL.md` and patch only real incompatibilities.

## Repo contents checklist

| Item | Present |
|------|---------|
| `.env.example` (`VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000`) | Yes |
| `package.json` scripts (`dev`, `dev:mock`, `test:mock-protocol`, `test:stream60`) | Yes |
| Protocol mock under `server/` | Yes |
| `public/data/rescue/` static package | Yes |
| `start-windows.bat` / `start-windows.ps1` | Yes |
| `docs/WAYPOINT_PROTOCOL.md`, `INTEGRATION.md`, `WINDOWS_VERIFY.md`, `WINDOWS_GPU_CHECKLIST.md` | Yes |
