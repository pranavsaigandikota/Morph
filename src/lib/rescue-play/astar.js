/** Exact port of rescue_sim.pathfinding (`_astar`, `astar_path`, `path_to_actions`). */
import { ACTIONS } from "./actions.js";
import { key, Scenario } from "./scenario.js";
function less(a, b) {
    for (let i = 0; i < 4; i++)
        if (a[i] !== b[i])
            return a[i] < b[i];
    return false;
}
/** Binary min-heap; the full tuple order is total, so pop order equals Python heapq's. */
class MinHeap {
    constructor() {
        this.a = [];
    }
    get size() {
        return this.a.length;
    }
    push(e) {
        const a = this.a;
        a.push(e);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!less(a[i], a[p]))
                break;
            [a[i], a[p]] = [a[p], a[i]];
            i = p;
        }
    }
    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && less(a[l], a[m]))
                    m = l;
                if (r < a.length && less(a[r], a[m]))
                    m = r;
                if (m === i)
                    break;
                [a[i], a[m]] = [a[m], a[i]];
                i = m;
            }
        }
        return top;
    }
}
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
function astar(sc, blocked) {
    const start = sc.start;
    const goal = sc.goal;
    if (blocked.has(key(start[0], start[1])) || blocked.has(key(goal[0], goal[1])))
        return null;
    const h0 = manhattan(start, goal);
    const open = new MinHeap();
    open.push([h0, h0, start[1], start[0]]);
    const g = new Map([[key(start[0], start[1]), 0]]);
    const parent = new Map();
    const closed = new Set();
    while (open.size) {
        const [, , y, x] = open.pop();
        const ck = key(x, y);
        if (closed.has(ck))
            continue;
        if (x === goal[0] && y === goal[1]) {
            const path = [[x, y]];
            let cur = ck;
            while (parent.has(cur)) {
                const p = parent.get(cur);
                path.push([p[0], p[1]]);
                cur = key(p[0], p[1]);
            }
            return path.reverse();
        }
        closed.add(ck);
        const gc = g.get(ck);
        for (let a = 0; a < 4; a = (a + 1)) {
            const [dx, dy] = ACTIONS[a];
            const nx = x + dx;
            const ny = y + dy;
            const nk = key(nx, ny);
            if (!sc.inBounds([nx, ny]) || blocked.has(nk) || closed.has(nk))
                continue;
            const ng = gc + 1;
            if (ng < (g.has(nk) ? g.get(nk) : 1 << 30)) {
                g.set(nk, ng);
                parent.set(nk, [x, y]);
                const h = manhattan([nx, ny], goal);
                open.push([ng + h, h, ny, nx]);
            }
        }
    }
    return null;
}
/**
 * Shortest 4-connected path `[[x, y], ...]` from start to goal (inclusive), or `null`.
 * Same Manhattan heuristic and tie-breaking as Python: heap key (f, h, y, x), neighbours
 * expanded up, down, left, right. A plain dict is validated like Python `Scenario.from_dict`.
 */
export function astarPath(scenario, opts = {}) {
    const sc = scenario instanceof Scenario ? scenario : Scenario.fromDict(scenario);
    const blocked = opts.allowHazards ? sc.obstacleSet : new Set([...sc.obstacleSet, ...sc.hazardSet]);
    return astar(sc, blocked);
}
/** Internal: A* from an arbitrary start cell (re-planning). */
export function astarFrom(sc, start, opts = {}) {
    return astarPath(sc.withStart(start), opts);
}
/** Convert a path of 4-adjacent cells into actions (throws on non-adjacent cells, like Python). */
export function pathToActions(path) {
    const out = [];
    for (let i = 0; i + 1 < path.length; i++) {
        const dx = path[i + 1][0] - path[i][0];
        const dy = path[i + 1][1] - path[i][1];
        const a = [0, 1, 2, 3].find((k) => ACTIONS[k][0] === dx && ACTIONS[k][1] === dy);
        if (a === undefined) {
            throw new Error(`cells [${path[i][0]}, ${path[i][1]}] and [${path[i + 1][0]}, ${path[i + 1][1]}] are not 4-adjacent`);
        }
        out.push(a);
    }
    return out;
}
