# Rescue Play: Cursor handoff (one-stop)

**Work on branch `cursor/game-experience-cd95`.** We made **no edits to the frontend repo**.
Everything here is a self-contained package for Cursor to integrate.

## 1. What this is

`@worldshift/rescue-play` (v0.1.0) is a zero-dependency, ESM, browser-ready TypeScript port of
the frozen Python `rescue_sim` `RescueEnv` step rules, plus:

* a play layer (`RescueGame`: restart, undo, metrics and a game-only score with stars);
* an exact port of the hazard-avoiding A\* (route overlay and player-vs-A\* comparison);
* 5 hand-designed fictional missions (2 8x8, 3 10x10) as static JSON;
* an input controller implementing control contract **t17u** (`createStepController`).

It needs **no Python, no FastAPI and no server**. The game runs entirely in the browser from
static JSON. Python is only needed to re-run the parity checks. Grid abstraction only: no physics,
no world model, and not for operational use (the disclaimer ships in every mission file).

## 2. Install and import

Two options. Use either one.

* **Vendored build:** copy `dist/` to `frontend/src/lib/rescue-play/` and import from
  `./lib/rescue-play/index.js`.
* **Local dependency:** add `"@worldshift/rescue-play": "file:../rescue_play"` to the frontend's
  `dependencies`, then `npm install`.

```ts
import { RescueGame, createStepController, astarPath, keyToAction } from "@worldshift/rescue-play";

const game = new RescueGame(missionJson);           // validates exactly like Python Scenario.validate
const ctl = createStepController(game, { holdRepeatMs: 200, onChange: (state, ev) => render(state, ev) });
```

There is no `createRescueGame` factory export. Use `new RescueGame(mission)`; if you want a
factory, a one-line `const createRescueGame = (m: object) => new RescueGame(m)` in app code is
equivalent. Do not call `game.step` from raw key handlers. Route all input through the controller.

## 3. Public asset paths

Copy `data/rescue-play/` to **`frontend/public/data/rescue-play/`**:

```
/data/rescue-play/manifest.json                       entry point: missions[], coordinate_system, action_mapping, rules, disclaimer
/data/rescue-play/missions/<id>.json                  scenario + `mission` metadata (title, briefing, objective, legend, par, ...)
/data/rescue-play/routes/<id>_astar.json              {mission_id, par, path, actions, action_names}
```

Resolve `mission` and `astar_route` paths from the manifest **relative to the manifest URL**.
Mission ids: `cypress-lane-flood`, `storm-damaged-facility`, `blocked-evacuation-corridor`,
`emergency-supply-route`, `hazardous-research-building`. This folder is separate from the
replay-viewer data at `/data/rescue/` (PPO-complete package) and `/data/rescue-unguided/`
(unguided package). Leave those untouched.

## 4. React + TypeScript example

```tsx
import { useEffect, useMemo, useState } from "react";
import { RescueGame, createStepController, type SimState } from "@worldshift/rescue-play";

const BASE = new URL("/data/rescue-play/manifest.json", window.location.origin);

export async function loadMission(id: string) {
  const manifest = await (await fetch(BASE)).json();
  const entry = manifest.missions.find((m: any) => m.id === id);
  return (await fetch(new URL(entry.mission, BASE))).json();
}

export function useRescueGame(mission: object, active = true) {
  const game = useMemo(() => new RescueGame(mission), [mission]);
  const [state, setState] = useState<SimState>(() => game.getState());
  const [, rerender] = useState(0);

  const ctl = useMemo(
    () =>
      createStepController(game, {
        holdRepeatMs: 200,          // t17u: tap = 1 step, hold = repeat every 200 ms
        collisionFlashMs: 350,      // brief collision cue
        isActive: () => active,     // e.g. false while a text field has focus
        onChange: (s) => { setState(s); rerender((n) => n + 1); },
      }),
    [game, active],
  );

  useEffect(() => {
    setState(game.getState());
    const down = (e: KeyboardEvent) => ctl.handleKeyDown(e);
    const up = (e: KeyboardEvent) => ctl.handleKeyUp(e);
    const blur = () => ctl.handleBlur();
    const vis = () => { if (document.visibilityState === "hidden") ctl.handleVisibilityHidden(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      ctl.dispose();
    };
  }, [ctl, game]);

  return {
    state,                                  // getState(): same JSON shape as Python env.get_state()
    ctl,
    flash: ctl.collisionFlash,              // draw the collision cue while true
    showAStar: ctl.showAStar,               // H toggles it, only after the episode ends
    metrics: game.metrics(),                // steps, collisions, hazards_entered, restarts, undo_count, native_total_reward, outcome
    score: game.score(),                    // game layer only: {score, stars, status, reason, efficiency}
    compare: game.compareWithAStar(),       // {optimal_length, player_steps, extra_steps, efficiency, first_divergence_step, astar_route, player_route}
  };
}

export function DPad({ ctl, done }: { ctl: ReturnType<typeof useRescueGame>["ctl"]; done: boolean }) {
  return (
    <div role="group" aria-label="Movement controls">
      <button aria-label="Move up" disabled={done} onClick={() => ctl.press("up")}>↑</button>
      <button aria-label="Move left" disabled={done} onClick={() => ctl.press("left")}>←</button>
      <button aria-label="Restart mission" onClick={() => ctl.restart()}>R</button>
      <button aria-label="Move right" disabled={done} onClick={() => ctl.press("right")}>→</button>
      <button aria-label="Move down" disabled={done} onClick={() => ctl.press("down")}>↓</button>
    </div>
  );
}

// A* compare panel: draw compare.player_route always; draw compare.astar_route when showAStar.
// Show par = compare.optimal_length, compare.player_steps, compare.extra_steps,
// compare.efficiency and compare.first_divergence_step after the episode ends.
// Show metrics.native_total_reward (simulator) and score.score / score.stars (game) separately.
```

Three.js mapping: world X = `x + 0.5`, world Z = `y + 0.5`, Y up (top-left origin, `grid[y][x]`).
See `INTEGRATION.md` for details.

## 5. Control contract summary (t17u)

Full text: [CONTROL_CONTRACT.md](CONTROL_CONTRACT.md). It supersedes the earlier one-step-only
contract.

1. Tap = one cell, stepped immediately on keydown (arrows / WASD).
2. Hold = repeat every 200 ms on the controller's own timer. OS repeat events (`repeat === true`)
   are ignored but still `preventDefault()`ed while active.
3. Release stops at once. The most recently pressed key drives, with no fallback. Blur,
   visibility-hidden and dispose stop all timers.
4. Holding into a wall gives one collision penalty, then the hold halts until the key is pressed
   again. Blocks are detected only from the env's step result.
5. Success, hazard or timeout stops everything until Restart.
6. The D-pad moves one step per click, with no hold. Movement buttons are disabled when done.
7. Undo only works during an active episode and cancels any hold.
8. Restart clears timers, held keys, the overlay, history and score, and is the only way to a new
   attempt. Arrows never scroll the page while controls are active.

## 6. Verification

* **`npm test`: 208 passed** in 4 files: 176 original engine/parity/game tests, 13 controls tests
  and 19 hold-controls tests.
* **`npm run parity`: PARITY OK.** Python→TS 153 cases / 518 sequences / **17,842 steps**;
  TS→Python **555 runs / 40,846 steps**; **0 mismatches**. The sample session also replays
  identically in Python.
* The frozen `/workspace/rescue_sim` was hash-verified unchanged. The engine is frozen: see
  [FREEZE.md](FREEZE.md) and `reports/engine_freeze.json`.

## 7. Browser results (summary)

Full details: [BROWSER_VALIDATION.md](BROWSER_VALIDATION.md).

* **Pass 1** (Playwright synthetic keys, not OS-level): all 5 missions OK. It found 3 demo issues,
  all fixed.
* **Pass 2** (real OS keys, Chromium + DevTools, **earlier one-step build**): collision ring,
  hazard failure, clean restart, 1000 ★★★ and 905 ★★ successes, A\* overlay, dropdown focus, and
  1366x768 / 1920x1080 viewports all OK. Video: **`qa/gameplay_os_keys_2x.mp4`** (77 s, 2x speed;
  shows pass 2 on the earlier one-step build, not the final controller).
* **Final pass** (real OS keys and mouse, **final t17u controller**, Blocked Evacuation
  Corridor): tap, D-pad, undo, hazard lock, restart, no scroll and a clean console all PASS. Video:
  **`qa/final_controls_pass_os_input.mp4`** (109 s, real time, 10 fps).
* **Physical-keyboard hold behaviour has NOT been verified by a human.** The OS automation tool
  cannot hold keys. Automated CDP-level browser tests (`qa/cdp/`: 1 s hold gives 6 steps, 0 after
  release; wall hold gives 1 collision, then it stops) and unit tests passed. The manual check in
  BROWSER_VALIDATION.md is **recommended but not done**.

## 8. Optional: four-agent Rescue Lab (unguided PPO)

Separate package: **`unguided_ppo_handoff.zip`** (at `/workspace/unguided_ppo_handoff.zip`).
Install it to `frontend/public/data/rescue-unguided/`. It is **separate from** the PPO-complete
**`cursor_handoff.zip`** (`/workspace/handoff_out/ppo_complete/cursor_handoff.zip`), which goes in
`/data/rescue/`. Display the agents in this order:

1. **Random**
2. **Unguided PPO**: "no shortest-path hint"
3. **Guided PPO**: "receives BFS shortest-path hint"
4. **A\***

Verified success rates (`comparison.json` in that package):

| seeds | map | Unguided PPO | Guided PPO |
|---|---|---|---|
| 20000-20199 | 8x8 | 66.0% | 99.5% |
| 20000-20199 | 10x10 | 55.0% | 99.0% |
| 30000-30199 | 8x8 | 72.5% | - |
| 30000-30199 | 10x10 | 52.0% | - |

All unguided failures on 20000-20199 were timeouts. Follow that package's README for layout and
caveats: seeds 20000-20199 had been used before for the guided model.

## 9. Integration checklist

- [ ] Work on branch `cursor/game-experience-cd95`.
- [ ] Copy `data/rescue-play/` to `frontend/public/data/rescue-play/`; `fetch('/data/rescue-play/manifest.json')` works.
- [ ] Vendor `dist/` or add the `file:` dependency; `import { RescueGame, createStepController }` compiles.
- [ ] Create the game with `new RescueGame(mission)` and the controller with `holdRepeatMs: 200`.
- [ ] Wire `keydown`, `keyup`, `blur` and `visibilitychange` to the controller; dispose on unmount.
- [ ] D-pad: four buttons with aria-labels calling `ctl.press(...)`, disabled when `state.done`; a Restart button that is always enabled.
- [ ] Collision cue while `ctl.collisionFlash`; clear route markers and effects on `restart`.
- [ ] After the episode: show the outcome, `score`/stars, native reward, and the A\* overlay (H) with par, extra steps, efficiency and first divergence.
- [ ] Show the mission disclaimer (`manifest.disclaimer`).
- [ ] Keep `/data/rescue/` and `/data/rescue-unguided/` untouched; optionally add the four-agent view.
- [ ] Never re-implement rules in the frontend (see FREEZE.md).
- [ ] Recommended: Arnov's physical-keyboard hold check (BROWSER_VALIDATION.md).

## 10. Package checksums (sha256)

The zip's own sha256 is in the sidecar file `rescue_play.zip.sha256`, next to the zip (outside it).
Per-file hashes for every file in the zip (except `reports/final_integrity.json` itself) are in
`reports/final_integrity.json`. `CURSOR_HANDOFF.md` cannot list its own hash; it is in that manifest.

Key files:

| file | sha256 |
|---|---|
| `package.json` | `9cb4f0fd7b56f6ce000056f308cdfe07c5ea0e0d92dd0732198465283eeea569` |
| `package-lock.json` | `38b415a367b371b8b897d36f6718aea34ba7c419e5b74c9a5c834107c3449ed5` |
| `tsconfig.json` | `5c8540ae5eaceadc7490a68fc1033c61b33c64d14fb197143a4e73f016656300` |
| `src/index.ts` | `3fc0ca4447a2e30c1c14514316ef47f7ef1c6b4a7d4784ae436769e5a8e71053` |
| `src/env.ts` | `645317bbaa4a72e6d746503e0cfd2627bc70a18cfe28a618fa98e2fd3a1d2b86` |
| `src/game.ts` | `b48a7d6870297efddd35a858a430b6fc4d51e827f47f15aa7aa28d74edf50e2e` |
| `src/astar.ts` | `7316671e0cc1eccdba0e4d0a13fef660695551338f84afabe053f34aef6d729a` |
| `src/scenario.ts` | `8f84a001e11449a70800fb1bbb7a08d09691b9e65b0475ec3de20cb6400219b3` |
| `src/actions.ts` | `6edb42013730d08b58ffc707b9ea1430df3bd73c73f4c16551f49d1592442eab` |
| `src/pyround.ts` | `7bcd6d3d754f33dadbae967a7948fb6df9ecd98c23e4f270d76f3092ea6964e1` |
| `src/pyrepr.ts` | `6506bd7d9c21e12691ef5e9265c8afed00a882420f9ddd30ae0b26b67340a340` |
| `src/controls.ts` | `3ef1f2b7dc514389d89bfa97334fe6b7ef198043c6938ad970c2794c5e0b9ac7` |
| `dist/index.js` | `7028b9d6b9493f9d04db15f1d621359829fe81a13e9ee4a4f4b3072f80fe80df` |
| `dist/index.d.ts` | `2ca1f06e19fe8b957f00dca152eb87d43fd825be76db2f236818f82a078c291d` |
| `dist/controls.js` | `645f56131624425d5a027638cca02a0a6b9d55a667aba9d5b7485c5869915324` |
| `dist/controls.d.ts` | `1caca4a1494a59fc86fda0f1fc2830b315786c1b1e852592a8f6b9051ef70ab1` |
| `dist/env.js` | `8fd6e190355eae6a4ee426a3d62900ada03e108863292deaff16cbe71c56429c` |
| `dist/game.js` | `3d99235e12ddcd563c5b91fd79bd5a2c93e88a89a003a1ccadaeca66166a64d0` |
| `dist/astar.js` | `81393ffa34312e47d375db31421864f4d5ad338c6b86e9afa751ed4de81d3c06` |
| `dist/scenario.js` | `56ea70010aaf71d01c4629cf9e634add1a38dc28731a1435340da8dceff794d3` |
| `demo/main.js` | `35bd8440e2eb7d1ccdbdd7b0a95afdb1afab85b2c52b46ac0d70c6a368e15532` |
| `demo/index.html` | `171e4edc6ea92e4d20d2c64aac97bf7cf2d275b98bd6d799e16c8ac78276c876` |
| `data/rescue-play/manifest.json` | `25a13966adf2a3d39e689d15d4020268136b387e7555f0476d24d7a92c484ea7` |
| `data/rescue-play/missions/blocked-evacuation-corridor.json` | `3a21c7c5992d5020622e7273d3b7a7f0b26a46d6277f8ca8ad6a8d4918f15425` |
| `data/rescue-play/missions/cypress-lane-flood.json` | `9babdc1608281a729cde765aadfa18e0ca6829ea6a8f236c6f97a938f6e2758b` |
| `data/rescue-play/missions/emergency-supply-route.json` | `63a1c1bc5329ca13f474ab8840fd9061b18f1d1a3d095d776c089c6b62276409` |
| `data/rescue-play/missions/hazardous-research-building.json` | `0d3a86eca084b3dc30e5940bf004e7ba6167d52e39f99e46064632273d66020c` |
| `data/rescue-play/missions/storm-damaged-facility.json` | `a7cea0d1b41d09321a67736101e00c72cf32c370fdcd23b853c9f874774ad269` |
| `CONTROL_CONTRACT.md` | `7acf49408a8ee4da43aaf8808cec62e5ef50edb94e0c9b5741cfd65ec00bf59e` |
| `BROWSER_VALIDATION.md` | `13c5ddd106c625330908fd9ad40800e6e5f4a50aeb02e257667a6b2ef09db600` |
| `FREEZE.md` | `ae76a34a467c487154ea1d82b1d510f5894e8f9a22a53e098d892df49a6ea991` |
| `INTEGRATION.md` | `59032a19afaf5c0b71f4d67a45223f81951ddf787e4304ed1294ad23bebe853f` |
| `README.md` | `f5175a1970780f26d05446567d6763172f575d473c977272df1a97021eb8aea0` |
| `reports/engine_freeze.json` | `cc45b100269d7953ab368199d06b5814b27f2c56538ee31b5d4731f336badf41` |
| `fixtures/parity_fixtures.json` | `45c8909eaec514c293340befc599dc3bb07ecf1635726ef27443d38f24d2982f` |
| `qa/gameplay_os_keys_2x.mp4` | `dc1114e3f5de31cb75d0de225ccb763202cfc4bda54ab55f970fdec6aab236e3` |
| `qa/final_controls_pass_os_input.mp4` | `6e9f633cb176f38f2c499db7aef00271c4de08eadac0588d436fcdb0e7d540ba` |
| `qa/cdp/cdp_hold_results.json` | `9c2e49ff6c1010e45309e335cc9f8a669def22eaa28e92ba49c0f8618b2f6ef1` |

Verify with `sha256sum <file>` from the package root.

