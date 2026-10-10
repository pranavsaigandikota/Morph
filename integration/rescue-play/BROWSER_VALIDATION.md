# Rescue Play: browser validation

Smoke-test demo (`demo/index.html`, served over HTTP from the package root). The demo is **not**
the WorldShift frontend. It is a zero-dependency page used to check the package in a real
browser. There were three passes, each with a different input method; the method is stated for
every result. Control contract: **t17u** (tap + hold-to-repeat), see
[CONTROL_CONTRACT.md](CONTROL_CONTRACT.md).

> **Not human-verified:** no human has checked hold-to-repeat with a physical keyboard. The
> evidence for hold behaviour is automated only: CDP-level browser tests (headless Chrome,
> `Input.dispatchKeyEvent`) and unit tests (`test/controls_hold.test.ts`, 19 tests), and both
> passed. The manual physical-key check below is **recommended but not done**.

## Summary

| Pass | Input method | Scope | Result |
|---|---|---|---|
| 1 | Playwright `page.keyboard` (synthetic, **not OS-level**) | all 5 missions | gameplay, scores, restarts, A\* OK; 3 demo issues found, all fixed since |
| 2 | Real OS keystrokes (xdotool) in Chromium with DevTools | Cypress Lane, Hazardous Research Building, dropdown focus, 2 viewports | OK; 2 more demo issues (favicon 404, A\* overlay after R), both fixed |
| Final | Real OS keys and mouse clicks, contract t17u | Blocked Evacuation Corridor (8x8, par 13) | checks 0, 1, 4-8 PASS; checks 2-3 (hold) **not testable** with the OS tool; covered at CDP level, pending a manual check |

## Pass 1: Playwright `page.keyboard` (not OS-level)

* All 5 missions played: gameplay, scores, restarts and the A\* comparison behaved as expected.
* Demo issues found (all since fixed):
  1. Leftover route dots stayed on the canvas after restart. Fixed: `clearRect` every frame.
  2. No feedback for a blocked move. Fixed: orange collision ring, now a 350 ms flash.
  3. OS auto-repeat consumed steps under the old contract. Fixed: `repeat === true` events are
     ignored; under t17u, hold-repeat runs on the controller's own timer.
* Screenshots: 01, 02, 12, 13, 14.

## Pass 2: real OS keystrokes (xdotool), Chromium + DevTools

* **Cypress Lane Flood Response** and **Hazardous Research Building**: collision ring, hazard
  failure, clean restart, success **1000 ★★★** with WASD, a **905 ★★** success, and the A\*
  overlay all worked.
* With the mission dropdown focused, arrow keys moved the agent and did **not** change the
  mission.
* Viewports 1366x768 and 1920x1080 (DevTools Device Toolbar): no clipping.
* Console: clean apart from a favicon 404, since fixed with a `data:` favicon.
* The A\* overlay persisted after R. Fixed: R now resets the overlay.
* Screenshots: 03-11 (03 shows the orange collision ring).
* Video: **`qa/gameplay_os_keys_2x.mp4`** (77 s, 2x speed). It shows **pass 2**, which ran on
  the **earlier one-step-only build** (before the t17u hold-to-repeat controller). It does not
  show the final controller. For that, see `qa/final_controls_pass_os_input.mp4`.

## Final pass: contract t17u, real OS keys and mouse clicks

Mission: **Blocked Evacuation Corridor** (8x8, par 13, `max_steps` 64). HUD texts are quoted
exactly ("…" marks omitted HUD fields).

| # | Check | Observed HUD / behaviour | Result |
|---|---|---|---|
| 0 | Console after clear + reload | clean | PASS |
| 1 | Tap = 1 step | `D` → `step 1/64 … native reward -0.1`; `Right` → `step 2/64 … -0.2` | PASS |
| 2 | Hold repeat (~200 ms) | the OS automation tool has no key-hold | **NOT TESTABLE (OS)**, passed at CDP level (below); not human-verified |
| 3 | Hold into a wall | the OS automation tool has no key-hold | **NOT TESTABLE (OS)**, passed at CDP level (below); not human-verified |
| 4 | D-pad, one step per click | ↑ wall `step 3/64 collisions 1 -1.3`; ↓ `step 4/64 -1.4`; ← wall `step 5/64 collisions 2 -2.5`; → wall `step 6/64 collisions 3 -3.6` | PASS |
| 5 | Undo | `step 5/64 collisions 2 … -2.5` | PASS |
| 6 | Hazard end | `step 7/64 collisions 2 hazards 1 … native reward -7.7 outcome hazard` / `FAILED (hazard) - press R to restart`. Arrows, U and D-pad ignored; direction buttons disabled; H shows the A\* route | PASS |
| 7 | D-pad Restart | `step 0/64 collisions 0 hazards 0 restarts 1` / `native reward 0`, clean canvas; one tap then gives `step 1/64` | PASS |
| 8 | No scroll, console | no page scroll, console empty, DevTools "No issues" | PASS |

Screenshots: 15-18. Video: **`qa/final_controls_pass_os_input.mp4`** (109 s, real time, 10 fps),
which shows the **final t17u controller** (tap, D-pad, undo, hazard lock, restart; no physical
hold, see checks 2-3).

**Limitation:** the 350 ms orange collision ring fades too quickly and was not captured in a
final-pass screenshot. Pass 2 screenshot 03 shows it.

### Checks 2-3 at CDP level (not OS-level)

Chrome DevTools Protocol `Input.dispatchKeyEvent` with `autoRepeat: false`, headless Chrome.
Script: `qa/cdp/cdp_hold_check.mjs`. Results: `qa/cdp/cdp_hold_results.json`. No OS key repeat is
generated, so this checks the controller's own hold timer, not OS keyboard behaviour.

* Open field, Right held for 1005 ms: **6 steps** (1 + 5), 0 collisions; **0 steps** after keyUp
  (still 6 one second later).
* Right held into a wall: **1 collision** (reward -1.1); the hold stops (`holding: false`);
  nothing happens after keyUp.
* Tap: 1 step.
* Real demo page (first mission), Right held for 1 s: 4 steps (3 moves, then 1 collision, then
  the hold stopped); nothing after keyUp; `scrollY` 0.

Unit tests also cover hold behaviour with a virtual clock (`test/controls_hold.test.ts`, 19 tests).

## Manual check for Arnov (recommended, NOT done)

This check has **not** been performed. Until it is, physical-keyboard hold behaviour counts as
unverified by a human. Only the automated CDP-level and unit tests passed.

1. Serve the package root (`python3 -m http.server 8765`) and open
   `http://localhost:8765/demo/index.html`. Choose **Blocked Evacuation Corridor**.
2. **Hold in open space:** from the start, hold **Right** for about 1 s, then release.
   * Expected: the agent moves one cell at once, then about one cell every 200 ms (~5/s). The
     HUD step count rises by about 5-6 and stops **as soon as** you release, with no extra step
     afterwards. Collisions do not increase while the path is open. The page does not scroll.
3. **Hold into a wall:** move next to a wall, then hold the key pointing into the wall for about 1 s.
   * Expected: `collisions` rises by exactly **1** (native reward -1.1 for that step), the
     orange ring flashes briefly, and the step count stops rising while you keep holding.
     Releasing and pressing again adds exactly one more collision.
4. Optional: hold a key and Alt-Tab away. Movement should stop (blur), and it should not resume
   when you come back until you press again.

Record the HUD lines before and after each hold.

## Control contract (t17u)

The full text is in [CONTROL_CONTRACT.md](CONTROL_CONTRACT.md). It supersedes the earlier
one-step-only contract:

1. Tap = one cell, stepped immediately on keydown.
2. Hold = repeat every 200 ms on the controller's own timer. OS repeat events are ignored but
   still `preventDefault()`ed.
3. Release stops at once. The most recently pressed key drives, with no fallback. Blur,
   visibility-hidden and dispose stop all timers.
4. Holding into a wall is penalised once, then the hold halts until the key is pressed again.
   Blocked moves are detected only from the env's step result.
5. Success, hazard or timeout stops everything until Restart.
6. The D-pad moves one step per click, with no hold.
7. Undo only works during an active episode and cancels any hold.
8. Restart clears timers, held keys, the overlay, history and score, and is the only way to start
   a new attempt.

## Screenshots and videos

| File | Pass | Shows |
|---|---|---|
| `qa/screenshots/01_mission_selection.png` | 1 | mission selection |
| `qa/screenshots/02_mid_gameplay_pass1.png` | 1 | mid-gameplay |
| `qa/screenshots/03_collision_feedback_os_keys.png` | 2 | orange collision ring (OS keys) |
| `qa/screenshots/04_hazard_failure_os_keys.png` | 2 | hazard failure |
| `qa/screenshots/05_restart_clean_os_keys.png` | 2 | clean restart |
| `qa/screenshots/06_success_score_os_keys.png` | 2 | success with score |
| `qa/screenshots/07_astar_route_comparison_os_keys.png` | 2 | A\* route comparison |
| `qa/screenshots/08_two_star_success_os_keys.png` | 2 | 2-star success |
| `qa/screenshots/09_dropdown_focus_os_keys.png` | 2 | dropdown focused, arrows move the agent |
| `qa/screenshots/10_viewport_1366x768.png` | 2 | 1366x768 viewport |
| `qa/screenshots/11_viewport_1920x1080.png` | 2 | 1920x1080 viewport |
| `qa/screenshots/12_hazard_failure_pass1.png` | 1 | hazard failure |
| `qa/screenshots/13_success_pass1.png` | 1 | success |
| `qa/screenshots/14_astar_overlay_pass1.png` | 1 | A\* overlay |
| `qa/screenshots/15_hud_dpad_midplay_final.png` | final | HUD + D-pad mid-play |
| `qa/screenshots/16_dpad_disabled_after_hazard_final.png` | final | D-pad disabled after hazard |
| `qa/screenshots/17_astar_route_after_episode_final.png` | final | A\* route after the episode |
| `qa/screenshots/18_clean_after_restart_final.png` | final | clean state after restart |
| `qa/gameplay_os_keys_2x.mp4` | 2 | 77 s, 2x speed, 1280x800; **earlier one-step-only build**, not the final controller |
| `qa/final_controls_pass_os_input.mp4` | final | 109 s, real time, 10 fps, 1280x800; **final t17u controller** (no physical hold) |
| `qa/cdp/cdp_hold_check.mjs`, `harness.html`, `cdp_hold_results.json` | CDP | hold checks (CDP-level, not OS-level) |
