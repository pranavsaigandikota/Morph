/**
 * Scenario model and validation - a port of rescue_sim/scenario.py
 * (Scenario.from_dict + Scenario.validate), including identical error messages.
 */
import { pyRepr } from "./pyrepr.js";
export const SCENARIO_VERSION = 1;
export const MIN_SIZE = 5;
export const MAX_SIZE = 64;
export const REQUIRED_KEYS = ["seed", "width", "height", "start", "goal", "walls", "hazards", "max_steps"];
/** Same name and messages as Python `rescue_sim.scenario.ScenarioError`. */
export class ScenarioError extends Error {
    constructor(message) {
        super(message);
        this.name = "ScenarioError";
    }
}
/** Python: `int(round(1.5 * width * height))` (banker's rounding; never a tie for integer sizes). */
export function defaultMaxSteps(width, height) {
    const v = 1.5 * width * height;
    const f = Math.floor(v);
    const diff = v - f;
    if (diff > 0.5)
        return f + 1;
    if (diff < 0.5)
        return f;
    return f % 2 === 0 ? f : f + 1;
}
const isInt = (v) => typeof v === "number" && Number.isInteger(v);
export const key = (x, y) => `${x},${y}`;
function toCell(value, name) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isInt)) {
        throw new ScenarioError(`${name} must be an [x, y] pair of integers, got ${pyRepr(value)}`);
    }
    return [value[0], value[1]];
}
function cmpCell(a, b) {
    return a[0] - b[0] || a[1] - b[1];
}
function toCells(values, name) {
    if (!Array.isArray(values))
        throw new ScenarioError(`${name} must be a list of [x, y] pairs`);
    const cells = values.map((v, i) => toCell(v, `${name}[${i}]`));
    if (new Set(cells.map((c) => key(c[0], c[1]))).size !== cells.length) {
        throw new ScenarioError(`${name} contains duplicate cells`);
    }
    return cells.sort(cmpCell);
}
const cellsOut = (cells) => [...cells].map((c) => [c[0], c[1]]).sort(cmpCell);
const reprCells = (cells) => pyRepr(cells);
/** 4-connected BFS, neighbour order up, down, left, right (same as Python). */
export function bfsReachable(width, height, start, goal, obstacles) {
    const sk = key(start[0], start[1]);
    const gk = key(goal[0], goal[1]);
    if (obstacles.has(sk) || obstacles.has(gk))
        return false;
    const seen = new Set([sk]);
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
        const [x, y] = queue[qi];
        if (key(x, y) === gk)
            return true;
        for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]) {
            const nk = key(nx, ny);
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !seen.has(nk) && !obstacles.has(nk)) {
                seen.add(nk);
                queue.push([nx, ny]);
            }
        }
    }
    return false;
}
export class Scenario {
    constructor(d) {
        this.version = d.version;
        this.seed = d.seed;
        this.width = d.width;
        this.height = d.height;
        this.start = d.start;
        this.goal = d.goal;
        this.walls = d.walls;
        this.doors = d.doors;
        this.blocked = d.blocked;
        this.hazards = d.hazards;
        this.maxSteps = d.maxSteps || defaultMaxSteps(d.width, d.height);
        const toSet = (cs) => new Set(cs.map((c) => key(c[0], c[1])));
        this.wallSet = toSet(d.walls);
        this.blockedSet = toSet(d.blocked);
        this.hazardSet = toSet(d.hazards);
        this.doorSet = toSet(d.doors);
        this.obstacleSet = new Set([...this.wallSet, ...this.blockedSet]);
    }
    /** Port of Python `Scenario.from_dict(data, validate=True)` (same checks, order and messages). */
    static fromDict(data, validate = true) {
        if (data instanceof Scenario)
            return Scenario.fromDict(data.toDict(), validate);
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
            throw new ScenarioError("scenario must be a dict");
        }
        const d = data;
        const missing = REQUIRED_KEYS.filter((k) => !(k in d));
        if (missing.length)
            throw new ScenarioError(`scenario is missing required keys: ${pyRepr(missing)}`);
        for (const k of ["width", "height", "max_steps"]) {
            if (!isInt(d[k]))
                throw new ScenarioError(`${k} must be an integer`);
        }
        if (d.max_steps <= 0)
            throw new ScenarioError("max_steps must be positive");
        const start = toCell(d.start, "start");
        const goal = toCell(d.goal, "goal");
        const walls = toCells(d.walls, "walls");
        const hazards = toCells(d.hazards, "hazards");
        const doors = toCells(d.doors === undefined ? [] : d.doors, "doors");
        const blocked = toCells(d.blocked === undefined ? [] : d.blocked, "blocked");
        const version = d.version === undefined ? SCENARIO_VERSION : Math.trunc(Number(d.version));
        const sc = new Scenario({
            version, seed: d.seed, width: d.width, height: d.height,
            start, goal, walls, doors, blocked, hazards, maxSteps: d.max_steps,
        });
        if (validate)
            sc.validate();
        return sc;
    }
    static fromJSON(text, validate = true) {
        let data;
        try {
            data = JSON.parse(text);
        }
        catch (exc) {
            throw new ScenarioError(`invalid JSON: ${exc.message}`);
        }
        return Scenario.fromDict(data, validate);
    }
    inBounds(c) {
        return c[0] >= 0 && c[0] < this.width && c[1] >= 0 && c[1] < this.height;
    }
    /** Port of Python `Scenario.validate(require_hazard_free_path)`. Returns `this`. */
    validate(requireHazardFreePath = false) {
        for (const [name, v] of [["width", this.width], ["height", this.height], ["max_steps", this.maxSteps]]) {
            if (!isInt(v))
                throw new ScenarioError(`${name} must be an integer`);
        }
        if (!(MIN_SIZE <= this.width && this.width <= MAX_SIZE && MIN_SIZE <= this.height && this.height <= MAX_SIZE)) {
            throw new ScenarioError(`width/height must be within [${MIN_SIZE}, ${MAX_SIZE}], got ${this.width}x${this.height}`);
        }
        if (this.maxSteps <= 0)
            throw new ScenarioError("max_steps must be positive");
        if (this.seed !== null && this.seed !== undefined && !isInt(this.seed)) {
            throw new ScenarioError("seed must be an integer or null");
        }
        const groups = [
            ["start", [this.start]], ["goal", [this.goal]], ["walls", this.walls],
            ["hazards", this.hazards], ["doors", this.doors], ["blocked", this.blocked],
        ];
        for (const [name, cells] of groups) {
            for (const c of cells) {
                if (!this.inBounds(c)) {
                    throw new ScenarioError(`${name} cell ${pyRepr(c)} is out of bounds for ${this.width}x${this.height}`);
                }
            }
        }
        if (this.start[0] === this.goal[0] && this.start[1] === this.goal[1]) {
            throw new ScenarioError("start and goal must differ");
        }
        for (const [name, c] of [["start", this.start], ["goal", this.goal]]) {
            const k = key(c[0], c[1]);
            if (this.wallSet.has(k))
                throw new ScenarioError(`${name} is on a wall`);
            if (this.blockedSet.has(k))
                throw new ScenarioError(`${name} is on a blocked cell`);
            if (this.hazardSet.has(k))
                throw new ScenarioError(`${name} is on a hazard`);
        }
        const pairs = [
            ["walls", this.walls, "hazards", this.hazardSet],
            ["walls", this.walls, "blocked", this.blockedSet],
            ["walls", this.walls, "doors", this.doorSet],
            ["blocked", this.blocked, "hazards", this.hazardSet],
            ["doors", this.doors, "hazards", this.hazardSet],
        ];
        for (const [an, a, bn, b] of pairs) {
            const overlap = a.filter((c) => b.has(key(c[0], c[1])));
            if (overlap.length)
                throw new ScenarioError(`${an} and ${bn} overlap at ${reprCells(cellsOut(overlap))}`);
        }
        let obstacles = this.obstacleSet;
        if (requireHazardFreePath)
            obstacles = new Set([...obstacles, ...this.hazardSet]);
        if (!bfsReachable(this.width, this.height, this.start, this.goal, obstacles)) {
            throw new ScenarioError("scenario is unsolvable: no path from start to goal avoiding walls/blocked" +
                (requireHazardFreePath ? "/hazards" : ""));
        }
        return this;
    }
    hasHazardFreePath() {
        return bfsReachable(this.width, this.height, this.start, this.goal, new Set([...this.obstacleSet, ...this.hazardSet]));
    }
    /** Same as Python `Scenario.to_dict()` (key order and sorted cell lists). */
    toDict() {
        const cp = (cs) => cellsOut(cs);
        return {
            version: this.version,
            seed: this.seed === undefined ? null : this.seed,
            width: this.width,
            height: this.height,
            start: [this.start[0], this.start[1]],
            goal: [this.goal[0], this.goal[1]],
            walls: cp(this.walls),
            doors: cp(this.doors),
            blocked: cp(this.blocked),
            hazards: cp(this.hazards),
            max_steps: this.maxSteps,
        };
    }
    /** Copy with a different start (used by re-planning A*); not validated. */
    withStart(start) {
        return new Scenario({ ...this, start: [start[0], start[1]], maxSteps: this.maxSteps });
    }
}
