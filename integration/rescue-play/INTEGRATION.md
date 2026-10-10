# Integrating rescue-play into the React / Three.js frontend

## 1. Copy

* Data: copy `data/rescue-play/` to `frontend/public/data/rescue-play/` -> loadable at
  `fetch('/data/rescue-play/manifest.json')`; mission and route paths in the manifest are
  relative to the manifest URL.
* Code: copy `dist/` to `frontend/src/lib/rescue-play/` and import from
  `./lib/rescue-play/index.js`, **or** add `"@worldshift/rescue-play": "file:../rescue_play"`
  to the frontend's `dependencies` and `npm install`.

The existing replay viewer data at `/data/rescue/` (the PPO/A\*/Random handoff package) is
untouched and independent: rescue-play uses its own folder `/data/rescue-play/`. Both use the
same scenario format and coordinate system, so the same map renderer can draw both. A replay
from `/data/rescue/replays/...` can be re-simulated in the browser with
`replayEpisode(replay.actions, replay.scenario)` if needed.

## 2. Manifest

```json
{ "missions": [ { "id": "cypress-lane-flood", "title": "...", "map_size": "10x10", "par": 16,
    "max_steps": 100, "seed": 900001, "difficulty": "easy",
    "mission": "missions/cypress-lane-flood.json", "astar_route": "routes/cypress-lane-flood_astar.json" } ],
  "coordinate_system": { ... }, "action_mapping": { ... }, "disclaimer": "..." }
```

Route files: `{mission_id, par, path: [[x,y],...], actions, action_names}`.

## 3. Hook

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RescueGame, keyToAction, type SimState, type AStarComparison } from "./lib/rescue-play/index.js";

const MANIFEST_URL = new URL("/data/rescue-play/manifest.json", window.location.origin);

export function useRescueGame(missionId: string) {
  const gameRef = useRef<RescueGame | null>(null);
  const [state, setState] = useState<SimState | null>(null);
  const [mission, setMission] = useState<any>(null);
  const [comparison, setComparison] = useState<AStarComparison | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const manifest = await (await fetch(MANIFEST_URL)).json();
      const entry = manifest.missions.find((m: any) => m.id === missionId);
      const data = await (await fetch(new URL(entry.mission, MANIFEST_URL))).json();
      if (cancelled) return;
      gameRef.current = new RescueGame(data);
      setMission(data.mission);
      setComparison(null);
      setState(gameRef.current.getState());
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  const refresh = () => {
    const g = gameRef.current!;
    setState(g.getState());
    setComparison(g.done ? g.compareWithAStar() : null); // A* overlay only after finishing
  };

  const act = useCallback((input: number | string) => {
    const g = gameRef.current;
    if (!g || g.done) return;
    g.step(input);
    refresh();
  }, []);
  const restart = useCallback(() => { gameRef.current?.restart(); refresh(); }, []);
  const undo = useCallback(() => { gameRef.current?.undo(); refresh(); }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "r" || ev.key === "R") restart();
      else if (ev.key === "u" || ev.key === "Backspace") undo();
      else if (keyToAction(ev.key) !== null) act(ev.key);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, restart, undo]);

  const g = gameRef.current;
  return useMemo(() => ({
    mission, state, comparison, act, restart, undo,
    metrics: g?.metrics() ?? null, score: g?.score() ?? null,
  }), [mission, state, comparison]);
}
```

Render `state.walls / blocked / doors / hazards / start / goal / agent`; animate
`state.trajectory` (each step has `from`, `to`, `collision`, `hazard`, `outcome`; on collision
`from == to` - play a bump toward `action_name`). Show `metrics.native_total_reward` (the
simulator reward) and `score` (game layer) separately.

## Controls

All input must follow [CONTROL_CONTRACT.md](CONTROL_CONTRACT.md) (t17u, which supersedes the
one-step-only contract):
- A tap moves one cell. Holding a key repeats every 200 ms on the controller's own timer; OS
  key repeat is ignored.
- Release, blur or visibility-hidden stops at once.
- Holding into a wall is penalised once, then the hold halts.
- Success, hazard or timeout stops everything until Restart. The D-pad moves one step per click.
- Undo works only during an active episode.

Use `createStepController(game, { holdRepeatMs: 200 })` and wire `keydown`, `keyup`, `blur` and
`visibilitychange`. Do not call `game.step` from a raw `keydown` handler. Draw the collision cue
while `ctl.collisionFlash` is true. The contract doc has a `useRescueControls` hook example.

## 4. Three.js mapping

World X = `x + 0.5`, world Z = `y + 0.5`, Y up; the board spans `[0, width] x [0, height]` on
the XZ plane (subtract `width/2`, `height/2` to centre). Camera above looking down -Y with
screen-up = -Z gives the top-left-origin view. Narrative legend labels from
`mission.legend` (e.g. hazards = "flooded streets / downed power lines") are cosmetic only.

## 5. Judge flow

1. Pick a mission from `manifest.missions` (e.g. *Cypress Lane Flood Response*).
2. Play with arrows/WASD; bump a wall (collision, agent stays, -1.1 reward).
3. Take the tempting short cut and enter a hazard -> episode ends with outcome `hazard`, score 0.
4. Press R (restart) - `metrics.restarts` increments.
5. Reach the goal -> outcome `success`, score and stars shown.
6. Show the A\* overlay (`comparison.astar_route` vs `comparison.player_route`, extra steps,
   efficiency, first divergence step). `samples/session_*.json` contains exactly this flow.

## 6. Guarantees and caveats

* Step results, state, rewards and A\* are bit-identical to the frozen Python simulator
  (`npm test`, `npm run parity`). PPO results are not touched or re-evaluated by this package.
* Score / stars / undo are game-layer features, not part of the simulator contract.
* Missions are fictional grid abstractions, not for operational use.
