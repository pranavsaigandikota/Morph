export type Cell = [number, number];
export declare const SCENARIO_VERSION = 1;
export declare const MIN_SIZE = 5;
export declare const MAX_SIZE = 64;
export declare const REQUIRED_KEYS: readonly ["seed", "width", "height", "start", "goal", "walls", "hazards", "max_steps"];
/** JSON scenario as produced by Python `Scenario.to_dict()` (extra keys such as `mission` are ignored). */
export interface ScenarioDict {
    version?: number;
    seed: number | null;
    width: number;
    height: number;
    start: Cell;
    goal: Cell;
    walls: Cell[];
    doors?: Cell[];
    blocked?: Cell[];
    hazards: Cell[];
    max_steps: number;
    [extra: string]: unknown;
}
/** Same name and messages as Python `rescue_sim.scenario.ScenarioError`. */
export declare class ScenarioError extends Error {
    constructor(message: string);
}
/** Python: `int(round(1.5 * width * height))` (banker's rounding; never a tie for integer sizes). */
export declare function defaultMaxSteps(width: number, height: number): number;
export declare const key: (x: number, y: number) => string;
/** 4-connected BFS, neighbour order up, down, left, right (same as Python). */
export declare function bfsReachable(width: number, height: number, start: Cell, goal: Cell, obstacles: Set<string>): boolean;
export declare class Scenario {
    readonly version: number;
    readonly seed: number | null;
    readonly width: number;
    readonly height: number;
    readonly start: Cell;
    readonly goal: Cell;
    readonly walls: Cell[];
    readonly doors: Cell[];
    readonly blocked: Cell[];
    readonly hazards: Cell[];
    readonly maxSteps: number;
    readonly wallSet: Set<string>;
    readonly blockedSet: Set<string>;
    readonly hazardSet: Set<string>;
    readonly doorSet: Set<string>;
    /** walls ∪ blocked */
    readonly obstacleSet: Set<string>;
    private constructor();
    /** Port of Python `Scenario.from_dict(data, validate=True)` (same checks, order and messages). */
    static fromDict(data: unknown, validate?: boolean): Scenario;
    static fromJSON(text: string, validate?: boolean): Scenario;
    inBounds(c: readonly number[]): boolean;
    /** Port of Python `Scenario.validate(require_hazard_free_path)`. Returns `this`. */
    validate(requireHazardFreePath?: boolean): this;
    hasHazardFreePath(): boolean;
    /** Same as Python `Scenario.to_dict()` (key order and sorted cell lists). */
    toDict(): ScenarioDict;
    /** Copy with a different start (used by re-planning A*); not validated. */
    withStart(start: Cell): Scenario;
}
