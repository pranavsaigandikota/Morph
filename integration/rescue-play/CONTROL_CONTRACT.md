# Rescue Mission CONTROL CONTRACT (t17u: tap + hold-to-repeat)

> **Supersedes** the earlier one-step-only contract (no hold-to-move). Changes: holding a
> movement key now repeats on the controller's own timer, with collision-halt; Undo is defined
> explicitly (active episode only); restart clears all timers. OS key repeat is still ignored.

Shared input contract for every Rescue Mission frontend (smoke-test demo, React/Three.js app).
It covers **input only**. Step rules, rewards and termination stay in the frozen `RescueEnvTS`
(bit-identical to Python `RescueEnv`); controls never predict or re-implement them.

## Rules

1. **Tap = one cell, stepped immediately.** A `keydown` of W/A/S/D or an arrow key
   (`KeyW/KeyA/KeyS/KeyD` codes too) calls `game.step(action)` once, synchronously. A second
   `keydown` of a key that has not been released does nothing.
2. **Hold = repeat every `holdRepeatMs` (default 200 ms, ~5 steps/s) on the controller's own
   timer.** The first repeat fires one interval after the keydown, then one every interval
   after that. OS key repeat plays no part: events with `repeat === true` never step, but they are
   still `preventDefault()`ed while controls are active. `holdRepeatMs: 0` turns hold off,
   giving one step per press.
3. **Release stops at once.** `keyup` of the driving key cancels the timer, and no further step
   happens. With several movement keys held, the **most recently pressed** key drives. Releasing it
   stops movement with **no fallback** to another held key. Window `blur`, `visibilitychange` to
   hidden, and `dispose()` stop all timers and forget held keys.
4. **Holding into a wall is penalised once.** The tap/initial step is a normal env step: if it
   collides, the env's native collision penalty applies once and no hold starts. If any hold step
   collides, auto-repeat halts for that hold (`hold_stopped_collision`) until the key is released
   and pressed again. A blocked move is detected **only** from the env's own step result
   (`trajectory[-1].collision`). The controller never predicts a block and never skips a
   `game.step`.
5. **Success, hazard failure and timeout stop everything.** The hold timer is cleared at once,
   and every movement input (keys, D-pad) is ignored until Restart.
6. **The on-screen D-pad moves exactly one step per click**, with no hold. Movement buttons are
   disabled while the episode is done. Restart stays enabled.
7. **Undo only works during an active episode.** Undo (U key / `undo()`) cancels any active hold.
   The key must then be released and pressed again. Undo is refused once the episode has
   succeeded, failed or timed out, because it would revive a finished episode.
8. **Restart is the only way to start a new attempt.** It clears the hold timer, the
   collision-flash timer, held keys, the A\* overlay, step history/trajectory and the score
   state. The renderer clears canvas effects and route markers (e.g. `clearRect` every frame).
   Collision feedback is a brief visual cue (`collisionFlash`, default 350 ms), visual only.
   Arrows/WASD/R are `preventDefault()`ed only while `isActive()` is true, so the page never
   scrolls during play and other inputs (a focused `<select>`) keep their keys.

## Reference implementation: `createStepController`

[`src/controls.ts`](src/controls.ts), exported from the package root. It only calls
`game.step`, `game.restart` and `game.undo`, and reads `game.env.trajectory` / `game.done`.

```ts
const ctl = createStepController(game: RescueGame, {
  onChange?(state: SimState, event: ControlEvent): void, // every change, incl. hold steps & flash_end
  isActive?(): boolean,                // default () => true
  keyMap?: Record<string, Action>,     // lower-case key/code -> action; default keyToAction
  enableUndo?: boolean,                // U key; default true
  holdRepeatMs?: number,               // default 200; 0 = no hold
  collisionFlashMs?: number,           // default 350; 0 = no flash timer
  scheduler?: { setTimeout(fn, ms): unknown; clearTimeout(h): void }, // default globals
});
ctl.handleKeyDown(ev: KeyEventLike): ControlEvent;   // KeyEventLike = {key, code?, repeat?, preventDefault?()}
ctl.handleKeyUp(ev: KeyEventLike): void;
ctl.handleBlur(): void;
ctl.handleVisibilityHidden(): void;                  // same as handleBlur
ctl.press(action: Action | ActionName): ControlEvent; // D-pad, one step
ctl.undo(): ControlEvent; ctl.restart(): ControlEvent; ctl.toggleAStar(): ControlEvent;
ctl.dispose(): void;
// read-only: game, canMove, holding, lastCollision, collisionFlash, showAStar, heldKeys
```

`ControlEvent = {type, source: "keyboard" | "dpad" | "hold" | "api", action, collision, done, showAStar}`.
Types: `step`, `hold_step`, `hold_stopped_collision` (source `hold`), `restart`, `undo`,
`toggle_astar`, `flash_end`, and the non-changing `ignored_repeat | ignored_held | ignored_done |
ignored_inactive | ignored_key`.

## Minimal React hook

```tsx
import { useEffect, useMemo, useState } from "react";
import { RescueGame, createStepController, type SimState } from "@worldshift/rescue-play";

export function useRescueControls(mission: object, active = true) {
  const game = useMemo(() => new RescueGame(mission), [mission]);
  const [state, setState] = useState<SimState>(() => game.getState());
  const [, bump] = useState(0); // re-render on flash_end / toggle

  const ctl = useMemo(
    () =>
      createStepController(game, {
        holdRepeatMs: 200,
        collisionFlashMs: 350,
        isActive: () => active,
        onChange: (s) => { setState(s); bump((n) => n + 1); },
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
      ctl.dispose(); // clears hold + flash timers
    };
  }, [ctl, game]);

  return {
    state,
    flash: ctl.collisionFlash,   // draw the brief collision cue while true
    showAStar: ctl.showAStar,
    holding: ctl.holding,
    canMove: !state.done,        // disable D-pad movement buttons when false
    press: ctl.press,            // <button aria-label="Move up" onClick={() => press("up")}>
    restart: ctl.restart,        // always enabled
    undo: ctl.undo,
    metrics: game.metrics(),
    score: game.score(),
  };
}
```

## Rule → tests

Hold tests live in `test/controls_hold.test.ts` and use an injected virtual-clock scheduler, plus
one test with vitest fake timers. The earlier one-step tests in `test/controls.test.ts` still pass
unchanged; they cover key mapping, preventDefault and the done-lock.

| Rule | Tests |
|---|---|
| 1 tap | `rule 1: tap = 1 step, stepped immediately on keydown`; (`controls.test.ts`) `rule 1: a second keydown without keyup is ignored`, `action mapping is identical to keyToAction` |
| 2 hold | `rule 2: holding 1000 ms gives 1 + 5 steps (nothing early at 199 ms)`; `rule 2: OS repeat events add nothing during a hold (but are preventDefault'd)`; `holdRepeatMs = 0 gives one step per press`; `works with vitest fake timers and the default (global) scheduler`; (`controls.test.ts`) `rule 2: a repeat event is ignored` |
| 3 release / blur / most-recent | `rule 3: release stops immediately (no step after keyup even when timers advance)`; `rule 3: blur stops the hold (and visibility-hidden does too)`; `rule 3: the most recently pressed key drives; releasing it stops with no fallback`; `dispose clears the timers`; (`controls.test.ts`) `rule 3: keyup re-arms the key`, `blur re-arms held keys` |
| 4 wall | `rule 4: holding into a wall gives exactly 1 collision then halts; a re-press gives one more`; `rule 4: a collision mid-hold halts the hold` |
| 5 done | `rule 5: the hold stops on success`; `rule 5: the hold stops on a hazard`; `rule 5: the hold stops at timeout`; (`controls.test.ts`) `rule 8: no movement after success / hazard failure / timeout` |
| 6 D-pad | `rule 6: the D-pad stays one step per click (no hold)`; (`controls.test.ts`) `rule 4: D-pad press steps exactly once per call` |
| 7 undo | `rule 7: undo during play works and cancels the hold`; `rules 5/7: after done, undo is refused and no steps happen` |
| 8 restart / feedback / scroll | `rule 8: restart clears the timers and resets step, score and trajectory`; `collision flash ends after collisionFlashMs (default 350) with a flash_end event`; (`controls.test.ts`) `rules 6/8: restart re-enables movement and clears state`, `rule 7: collision flag reporting`, `rule 5: preventDefault for arrows/WASD/R only while active, not for unrelated keys` |

Rule numbers in the `controls.test.ts` test names follow the earlier contract.

There is also a supplementary **CDP-level** browser check (not OS-level):
`qa/cdp/cdp_hold_check.mjs`, with results in `qa/cdp/cdp_hold_results.json`.
