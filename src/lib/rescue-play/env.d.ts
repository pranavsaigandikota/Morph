/**
 * RescueEnvTS - exact port of the frozen Python `rescue_sim.env.RescueEnv` step rules
 * (observations are not ported; use getState()).
 */
import { type Action, type ActionName } from "./actions.js";
import { Scenario, type Cell, type ScenarioDict } from "./scenario.js";
export declare const STATE_VERSION = 1;
export declare const COORDINATE_SYSTEM: {
    readonly format: "[x, y]";
    readonly origin: "top-left";
    readonly x_axis: "right";
    readonly y_axis: "down";
    readonly grid_indexing: "grid[y][x]";
    readonly actions: {
        readonly "0": "up (y-1)";
        readonly "1": "down (y+1)";
        readonly "2": "left (x-1)";
        readonly "3": "right (x+1)";
    };
};
export type Outcome = "success" | "hazard" | "timeout" | null;
export interface RewardConfig {
    goal: number;
    step: number;
    collision: number;
    hazard: number;
}
/** Defaults identical to Python RewardConfig. */
export declare const DEFAULT_REWARDS: Readonly<RewardConfig>;
export interface StepInfo {
    outcome: Outcome;
    collision: boolean;
    hazard: boolean;
    position: Cell;
    step_count: number;
    cumulative_reward: number;
    collisions: number;
}
export interface TrajectoryStep {
    step: number;
    action: Action;
    action_name: ActionName;
    from: Cell;
    to: Cell;
    reward: number;
    collision: boolean;
    hazard: boolean;
    terminated: boolean;
    truncated: boolean;
    outcome: Outcome;
}
export interface StepResult {
    reward: number;
    terminated: boolean;
    truncated: boolean;
    info: StepInfo;
}
export interface SimState {
    state_version: number;
    coordinate_system: typeof COORDINATE_SYSTEM;
    seed: number | null;
    width: number;
    height: number;
    walls: Cell[];
    doors: Cell[];
    blocked: Cell[];
    hazards: Cell[];
    start: Cell;
    goal: Cell;
    max_steps: number;
    agent: Cell;
    step_count: number;
    terminated: boolean;
    truncated: boolean;
    done: boolean;
    outcome: Outcome;
    cumulative_reward: number;
    collisions: number;
    hazard_terminates: boolean;
    reward_config: RewardConfig;
    scenario: ScenarioDict;
    trajectory?: TrajectoryStep[];
}
export interface EnvOptions {
    rewardConfig?: Partial<RewardConfig>;
    /** Default true (episode ends on hazard entry). */
    hazardTerminates?: boolean;
    /** Override the scenario's max_steps (Python `RescueEnv(max_steps=...)`). */
    maxSteps?: number | null;
}
export declare function resolveRewards(rc?: Partial<RewardConfig>): RewardConfig;
export declare class RescueEnvTS {
    readonly scenario: Scenario;
    readonly rewardConfig: RewardConfig;
    readonly hazardTerminates: boolean;
    agentPos: Cell;
    stepCount: number;
    /** Unrounded running sum of rounded per-step rewards (exactly as Python). */
    private cumulative;
    terminated: boolean;
    truncated: boolean;
    outcome: Outcome;
    collisions: number;
    trajectory: TrajectoryStep[];
    /** Loads + validates the scenario (Python `Scenario.from_dict`) and resets. */
    constructor(scenario: Scenario | ScenarioDict, opts?: EnvOptions);
    get done(): boolean;
    get cumulativeReward(): number;
    private info;
    /** Back to the scenario start (Python `reset()` with the same scenario). Returns the reset info. */
    reset(): StepInfo;
    /** Exact port of Python `RescueEnv.step`. Throws after the episode ended and on invalid actions. */
    step(action: unknown): StepResult;
    /** Same JSON shape as Python `env.get_state()`. */
    getState(includeTrajectory?: boolean): SimState;
    /** Python `env.get_trajectory()`. */
    getTrajectory(): {
        scenario_seed: number | null;
        length: number;
        actions: Action[];
        steps: TrajectoryStep[];
    };
}
export interface ReplayResult {
    replay_version: number;
    scenario: ScenarioDict;
    reward_config: RewardConfig;
    hazard_terminates: boolean;
    actions: Action[];
    unused_actions: number;
    trajectory: TrajectoryStep[];
    final_state: {
        agent: Cell;
        step_count: number;
        terminated: boolean;
        truncated: boolean;
        done: boolean;
        collisions: number;
    };
    outcome: Outcome;
    total_reward: number;
}
/** Exact port of Python `replay_episode(actions, scenario, reward_config, hazard_terminates)`. */
export declare function replayEpisode(actions: readonly unknown[], scenario: Scenario | ScenarioDict, opts?: {
    rewardConfig?: Partial<RewardConfig>;
    hazardTerminates?: boolean;
}): ReplayResult;
