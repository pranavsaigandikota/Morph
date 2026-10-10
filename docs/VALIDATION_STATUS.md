# World Explorer validation status

## Mock mode (this environment) — PASSED

| Check | Result |
|-------|--------|
| `WS /stream` hello + binary JPEG envelopes | Pass |
| Control messages (`buttons`, `dx`, `dy`, `scroll`, `ts`) | Pass |
| Generated FPS counted from wire JPEGs | ~70+ on protocol mock |
| Explicit **MOCK** badge when not real Codex | Pass |
| Bounded presentation queue / stale drop | Pass |
| Rescue Lab static `manifest.json` load | Pass |
| Random / A* / PPO comparison table | Pass |
| Create World MOCK seed (labeled) | Pass (UI) |

`FRONTEND_INTEGRATION.md` / `WorldShift-Interactive-Verification.zip` were **not present** in the repo at implement time. Client follows Phase-2 docs in `WAYPOINT_PROTOCOL.md` (Biome-compatible envelope). If Codex’s guide disagrees, **flag the discrepancy** before changing wire code.

## Real Codex Waypoint on Windows GPU PC — REQUIRED (not yet claimed)

| Check | Status |
|-------|--------|
| Connect to `VITE_WORLD_API_BASE_URL=http://127.0.0.1:8000` | Pending on your PC |
| No MOCK badge | Pending |
| WASD + mouse change generated pixels | Pending |
| Gen FPS ~71.7 / canvas Disp FPS ~20 | Pending |
| Zero frame-id gaps / decode failures | Pending (Codex already reported; re-verify via UI) |

Until the Windows GPU checklist passes, **World Explorer integration is not complete**.
