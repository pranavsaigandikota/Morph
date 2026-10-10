/**
 * Play layer on top of RescueEnvTS: restart / undo, player metrics, a game score and
 * A* comparison. Nothing here changes the simulator rules or the native reward.
 */
import { type Action } from "./actions.js";
import { RescueEnvTS, type EnvOptions, type Outcome, type SimState, type StepResult, type TrajectoryStep } from "./env.js";
import { Scenario, type Cell, type ScenarioDict } from "./scenario.js";
export interface AStarComparison {
    /** Moves on the hazard-avoiding A* path from the scenario start (null if none). */
    optimal_length: number | null;
    player_steps: number;
    /** player_steps - optimal_length (null if no optimal path). */
    extra_steps: number | null;
    /** optimal_length / player_steps for successful episodes, else null. */
    efficiency: number | null;
    success: boolean;
    /**
     * First 1-based step whose resulting position differs from the A* path
     * (including collisions and steps beyond the A* length); null if the player
     * followed the A* path exactly (so far).
     */
    first_divergence_step: number | null;
    /** Cells to draw: A* route and the player's route (start + positions, consecutive duplicates removed). */
    astar_route: Cell[] | null;
    player_route: Cell[];
    /** Player positions per step, start first (collisions repeat the cell). */
    player_positions: Cell[];
}
/** Compare a player trajectory (getState().trajectory) with the A* route. */
export declare function compareWithAStar(trajectory: readonly TrajectoryStep[], scenario: Scenario | ScenarioDict): AStarComparison;
export interface ScoreResult {
    /** Game-layer score (NOT part of the simulator contract). */
    score: number | null;
    stars: 0 | 1 | 2 | 3;
    status: "success" | "failure" | "in_progress";
    reason: string | null;
    efficiency: number | null;
    base: number | null;
    collision_penalty: number;
}
export declare const SCORE_RULES: {
    readonly base: "round(1000 * astar_len / steps) on success";
    readonly collision_penalty: 50;
    readonly floor: 0;
    readonly stars: "3 if efficiency >= 1.0, 2 if >= 0.8, 1 otherwise (success); 0 on failure";
    readonly failure: "score 0, stars 0, reason 'hazard' or 'timeout'";
};
/** Game score: success -> max(0, round(1000*astarLen/steps) - 50*collisions); failure -> 0 with reason. */
export declare function computeScore(outcome: Outcome, steps: number, collisions: number, astarLen: number | null): ScoreResult;
export interface PlayerMetrics {
    steps: number;
    collisions: number;
    hazards_entered: number;
    outcome: Outcome;
    success: boolean;
    failure: boolean;
    timeout: boolean;
    /** Native simulator reward (identical to Python cumulative_reward). */
    native_total_reward: number;
    restarts: number;
    undo_count: number;
    undo_used: boolean;
    attempt: number;
}
export interface AttemptSummary {
    attempt: number;
    actions: Action[];
    outcome: Outcome;
    steps: number;
    native_total_reward: number;
    collisions: number;
    undo_used: boolean;
    ended_by: "restart" | "done";
}
/** Input accepted by Python `replay_episode(actions, scenario, hazard_terminates=...)`. */
export interface ReplayInput {
    actions: Action[];
    scenario: ScenarioDict;
    hazard_terminates: boolean;
    reward_config: Record<string, number>;
}
export interface GameOptions extends EnvOptions {
    /** Optional mission metadata (passed through, cosmetic only). */
    mission?: unknown;
}
/**
 * Interactive game wrapper. `step()` accepts 0-3, 'up'/'down'/'left'/'right' or a key name
 * (ArrowUp, w, KeyW, ...). `getState()` is the Python-identical simulator state.
 */
export declare class RescueGame {
    readonly env: RescueEnvTS;
    readonly mission: unknown;
    restarts: number;
    undoCount: number;
    /** True if undo was used during the current attempt (undo is a play feature, not in Python). */
    undoUsedThisAttempt: boolean;
    attempts: AttemptSummary[];
    private readonly astarLen;
    constructor(scenario: Scenario | ScenarioDict, opts?: GameOptions);
    get scenario(): Scenario;
    get done(): boolean;
    /** Actions of the current attempt. */
    get history(): Action[];
    step(input: unknown): StepResult;
    private summary;
    /** Restart the mission from the start cell (counts a restart; unfinished attempts are logged). */
    restart(): SimState;
    /** Alias of restart(). */
    reset(): SimState;
    /**
     * PLAY FEATURE (not part of the simulator): restart + replay the history minus the last action.
     * Works also after the episode ended. Returns false if there is nothing to undo.
     */
    undo(): boolean;
    getState(includeTrajectory?: boolean): SimState;
    metrics(): PlayerMetrics;
    score(): ScoreResult;
    compareWithAStar(): AStarComparison;
    /** Current attempt as input for Python `replay_episode(actions, scenario, ...)`. */
    exportReplayInput(): ReplayInput;
}
