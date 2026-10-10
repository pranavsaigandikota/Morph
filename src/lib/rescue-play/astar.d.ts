/** Exact port of rescue_sim.pathfinding (`_astar`, `astar_path`, `path_to_actions`). */
import { type Action } from "./actions.js";
import { Scenario, type Cell, type ScenarioDict } from "./scenario.js";
export interface AStarOptions {
    /** Treat hazards as ordinary cells (Python `allow_hazards=True`). Default false. */
    allowHazards?: boolean;
}
/**
 * Shortest 4-connected path `[[x, y], ...]` from start to goal (inclusive), or `null`.
 * Same Manhattan heuristic and tie-breaking as Python: heap key (f, h, y, x), neighbours
 * expanded up, down, left, right. A plain dict is validated like Python `Scenario.from_dict`.
 */
export declare function astarPath(scenario: Scenario | ScenarioDict, opts?: AStarOptions): Cell[] | null;
/** Internal: A* from an arbitrary start cell (re-planning). */
export declare function astarFrom(sc: Scenario, start: Cell, opts?: AStarOptions): Cell[] | null;
/** Convert a path of 4-adjacent cells into actions (throws on non-adjacent cells, like Python). */
export declare function pathToActions(path: readonly (readonly number[])[]): Action[];
