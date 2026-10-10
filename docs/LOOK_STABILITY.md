# World Explorer look / visual stability

**Branch:** `cursor/explorer-look-stability-cd95`  
**Base (verified release):** `642330461a6f67073bbabae43f83e8c3f0523145`  
**Status:** Frontend mitigations only. **Do not claim GPU visual drift is fixed** until Windows A–E comparison passes.

## Likely root causes (ordered)

1. **Autoregressive Waypoint history drift (primary)**  
   The model conditions on rolling video history. Walking away from the SDXL seed and especially **full-circle look-around** do not reconstruct persistent geometry. Codex docs already note long-session visual drift; reset restores the seed with a visible jump.

2. **Frontend mouse dump bug (fixed on this branch)**  
   Baseline `sendControl` returned early when `bufferedAmount > 4096` **without clearing** accumulated `mouse_dx/dy`. The next successful tick could send up to **±1000** (protocol max) after a backlog — a sudden camera jump that accelerates collapse.  
   **Fix:** Always consume + clear accumulation each 20 Hz tick; drop look for that tick if the socket cannot send.

3. **Aggressive default look (mitigated)**  
   Default sensitivity was `1.0` with a ±1000 clamp. Rapid drag-look easily produced large per-tick turns.  
   **Fix:** Default sensitivity `0.35`, soft per-tick clamp `±48`, pitch scale `0.65`, mild EMA (`α=0.35`) that does not re-apply the same raw delta.

4. **Presentation scale (minor)**  
   Product is **native 1280×720** (see `PRODUCT_NATIVE_720P.md`). Prefer 1× native with responsive shrink; do not revive a 360p “small clear” product mode.

## Stability Mode (default ON)

Waypoint cannot keep a freely explored first-person video coherent forever. **Stability Mode** is the practical way to keep the picture clean while walking:

- Slower look (`maxPerTick` 20) and half-rate WASD into the model (`every 2nd` 20 Hz tick)  
- Idle hold (~550 ms after input stops) — **only while Stability is on**  
- **Informed auto-restore** via existing `POST /world/reset` on the **same** `session_id` (never `/world/start`)  
- Native 1280×720 presentation @ 1× (responsive shrink)  

### Precise auto-restore triggers (`src/lib/stabilityMode.ts`)

| Trigger | Constant | Exact rule |
|---|---|---|
| **Look budget** | `STABILITY_LOOK_YAW_RESTORE = 320` | Cumulative Σ\|`mouse_dx`\| sent on the wire since last restore (after clamp/smooth). Resets to 0 on every restore. |
| **Walk budget (default)** | `STABILITY_LOCOMOTION_MS_RESTORE = 22_000` | Wall-clock ms with any WASD held, advanced by `+50` per control tick (`CONTROL_MS`). Idle does **not** advance it. |
| **Walk budget presets** | `0` / `22000` / `45000` | Footer **Walk auto**: `Off (manual)` disables walk auto-restore; look budget still applies while Stability is on. |

Restore notification: bottom-right, `pointer-events: none`, ~5.5 s — does not block WASD/look.

### Reset / epoch / ack contract

1. `restoreScene` → `POST /world/{reset}` with `{session_id}` only (same session).  
2. If phase was paused (idle hold), follows with `POST /world/resume`.  
3. Client clears presentation queue; adopts new `epoch` from the next `type:"frame"` JSON (and other status messages).  
4. `display_ack` continues per consumed JPEG with that frame’s `frame_id` + `epoch` — credit window unchanged.  
5. Held WASD is re-hydrated from `keyHeldRef` so restore cannot stick empty controls.

### Stability OFF vs verified `6423304`

| Behavior | Stability ON | Stability OFF (this branch) | Exact `6423304` |
|---|---|---|---|
| Auto-restore | yes | no | no |
| Idle hold | yes | no | no |
| Half-rate WASD | yes | no | no |
| Mouse dump-on-buffer-skip fix | yes | yes | **bug present** |
| Default look sens | 0.22 | 0.22 | 1.0 |
| Soft per-tick clamp | ≤20 (mode) / ≤28 | ≤28 | ±1000 |
| Small clear viewport | yes | yes | fullscreen stretch |

So: Stability OFF removes auto-restore/idle/half-rate walk, but this branch is **not** bit-identical to `6423304` (look defaults + dump fix + presentation remain). Use commit `6423304` / `cursor/game-experience-cd95` @ that SHA for the verified baseline.

**Judging recommendation:** Prefer **Stability ON + Walk auto = Off (manual)** plus the always-visible **Restore Scene** button — judges control when the seed jumps; look budget still prevents full-circle melt. Use **22s** only if you want hands-free cleanliness during a timed demo.

## Outcome A — safest release-ready improvement (this branch)

| Change | Before (6423304) | After |
|---|---|---|
| Look sensitivity default | `1.0` (UI 0.5–3) | `0.22` (UI 0.1–0.75) |
| Per-tick mouse clamp | ±1000 | ±28 (protocol bound still enforced) |
| Buffer-skip behavior | Accumulate → dump | Consume/clear every tick |
| Pitch | same as yaw | ×0.55 |
| Smoothing | none | mild EMA, no double-send of raw accum |
| Idle hold | none | Pause generation ~550 ms after input stops |
| Restore Scene | “Reset” | Labeled; clears look risk; resumes if paused |
| Look risk banner | none | Advisory + manual Restore (never silent auto-reset) |
| Presentation | fullscreen stretch | **Native 1280×720 @ 1×** + mild contrast (responsive shrink; no 360p mode) |

**Does not modify:** RescueGame, PPO data, SDXL contract, `display_ack` semantics, inference weights, or wire protocol shape.

## Outcome B — longer-term (needs backend / research)

- History re-anchoring or keyframe conditioning that is **not** a full seed reset  
- Stronger temporal consistency / higher-quality Waypoint checkpoint (evaluate 1.5-1B only after measured FP8 results)  
- Optional idle pause of generation when no input (reduces standing-still mutation)  
- True persistent geometry is **out of scope** for walkable video; do not replace with fake 3D for the demo narrative  

## Files changed

- `src/lib/lookControl.ts` — pure clamp / sensitivity / prepare helpers  
- `src/hooks/useWorldStream.ts` — 20 Hz control path, telemetry, Restore lifecycle  
- `src/components/world/WorldViewer.tsx` — Restore Scene, look slider, risk banner, help  
- `src/pages/WorldExplorerPage.tsx` — wire look props  
- `scripts/verify-look-control.mjs` — unit tests  
- `docs/LOOK_STABILITY.md` — this document  

## Tests (cloud / offline)

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run test:look
npm.cmd run test:rescue
npm.cmd run test:rescue-keys
```

Visual drift **cannot** be asserted offline. Treat green tests as control-math + regression only.

---

## Windows GPU verification (RTX 4070 Ti SUPER)

Keep verified release available: checkout `6423304` (or `cursor/game-experience-cd95` at that commit) for baseline A; this branch for improved B. Use the **same SDXL seed** for both.

### Setup

```powershell
# Backend (already running preferred)
Set-Location 'C:\Users\filma\Documents\Morph\Codex Plus'
Invoke-RestMethod http://127.0.0.1:8000/health

# Frontend — improved branch
Set-Location 'C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift'
git fetch origin
git checkout cursor/explorer-look-stability-cd95
npm.cmd ci
npm.cmd run build
npm.cmd run dev
# Open http://127.0.0.1:4821/world  (or printed port)
```

Record overlay: Gen FPS, Disp FPS, look dx/dy (footer), GPU MiB, decode errors, Srv Drops.  
DevTools: `JSON.parse(document.querySelector('canvas').dataset.telemetry)`.

### Scenarios (same seed, screenshots at 0 / 15 / 30 / 60 s)

| ID | Action | Expectation to note |
|---|---|---|
| A | No movement 60 s | Idle generation may still mutate; note blur vs baseline |
| B | Forward-only (W) 60 s | Walk-away drift |
| C | Slow left/right look only | Should stay coherent longer on improved branch |
| D | Rapid camera spins | Baseline often collapses; improved should delay collapse; Restore Scene recovers seed |
| E | Mixed WASD + drag-look | Judge path — target 30–60 s usable |

**Success criterion for judging:** A judge can move and look **slowly** for 30–60 s without rapid blob collapse. Full 360° spins may still break the model — call out Restore Scene in the demo script.

### Metrics to log per run

- Generated FPS (`/world/metrics` and overlay Gen)  
- Canvas FPS (overlay Disp)  
- Control responsiveness (ack RTT from telemetry)  
- Visual quality notes at 0/15/30/60  
- Frame/decode errors, presentation skips, server drops  
- GPU memory MiB  

### Demo tips for Knight Hacks

1. Start from a strong preset seed.  
2. Keep look sensitivity at default `0.35` (or lower).  
3. Prefer short arcs of look, not continuous spinning.  
4. If the view melts, click **Restore Scene** (explicit seed jump).  
5. Keep Rescue Mission / Showdown as reliable offline demos if GPU world collapses.
