/**
 * Play layer on top of RescueEnvTS: restart / undo, player metrics, a game score and
 * A* comparison. Nothing here changes the simulator rules or the native reward.
 */
import { keyToAction } from "./actions.js";
import { astarPath } from "./astar.js";
import { RescueEnvTS } from "./env.js";
import { Scenario } from "./scenario.js";
/** Compare a player trajectory (getState().trajectory) with the A* route. */
export function compareWithAStar(trajectory, scenario) {
    const sc = scenario instanceof Scenario ? scenario : Scenario.fromDict(scenario);
    const path = astarPath(sc);
    const optimal = path ? path.length - 1 : null;
    const positions = [[sc.start[0], sc.start[1]], ...trajectory.map((t) => [t.to[0], t.to[1]])];
    const route = [];
    for (const p of positions) {
        const last = route[route.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1])
            route.push(p);
    }
    const steps = trajectory.length;
    const last = trajectory[steps - 1];
    const success = !!last && last.outcome === "success";
    let divergence = null;
    if (path) {
        for (let i = 1; i <= steps; i++) {
            const p = path[i];
            if (!p || p[0] !== positions[i][0] || p[1] !== positions[i][1]) {
                divergence = i;
                break;
            }
        }
    }
    return {
        optimal_length: optimal,
        player_steps: steps,
        extra_steps: optimal === null ? null : steps - optimal,
        efficiency: success && optimal !== null && steps > 0 ? optimal / steps : null,
        success,
        first_divergence_step: divergence,
        astar_route: path,
        player_route: route,
        player_positions: positions,
    };
}
export const SCORE_RULES = {
    base: "round(1000 * astar_len / steps) on success",
    collision_penalty: 50,
    floor: 0,
    stars: "3 if efficiency >= 1.0, 2 if >= 0.8, 1 otherwise (success); 0 on failure",
    failure: "score 0, stars 0, reason 'hazard' or 'timeout'",
};
/** Game score: success -> max(0, round(1000*astarLen/steps) - 50*collisions); failure -> 0 with reason. */
export function computeScore(outcome, steps, collisions, astarLen) {
    if (outcome === null) {
        return { score: null, stars: 0, status: "in_progress", reason: null, efficiency: null, base: null, collision_penalty: 0 };
    }
    if (outcome !== "success") {
        return { score: 0, stars: 0, status: "failure", reason: outcome, efficiency: null, base: null, collision_penalty: 0 };
    }
    const efficiency = astarLen !== null && steps > 0 ? astarLen / steps : 0;
    const base = Math.round(1000 * efficiency);
    const penalty = SCORE_RULES.collision_penalty * collisions;
    const stars = efficiency >= 1 ? 3 : efficiency >= 0.8 ? 2 : 1;
    return { score: Math.max(0, base - penalty), stars, status: "success", reason: null, efficiency, base, collision_penalty: penalty };
}
/**
 * Interactive game wrapper. `step()` accepts 0-3, 'up'/'down'/'left'/'right' or a key name
 * (ArrowUp, w, KeyW, ...). `getState()` is the Python-identical simulator state.
 */
export class RescueGame {
    constructor(scenario, opts = {}) {
        this.restarts = 0;
        this.undoCount = 0;
        /** True if undo was used during the current attempt (undo is a play feature, not in Python). */
        this.undoUsedThisAttempt = false;
        this.attempts = [];
        this.env = new RescueEnvTS(scenario, opts);
        this.mission = opts.mission ?? scenario.mission ?? null;
        const p = astarPath(this.env.scenario);
        this.astarLen = p ? p.length - 1 : null;
    }
    get scenario() {
        return this.env.scenario;
    }
    get done() {
        return this.env.done;
    }
    /** Actions of the current attempt. */
    get history() {
        return this.env.trajectory.map((t) => t.action);
    }
    step(input) {
        let action = input;
        if (typeof input === "string") {
            const k = keyToAction(input);
            if (k !== null)
                action = k;
        }
        const res = this.env.step(action);
        if (this.env.done)
            this.attempts.push(this.summary("done"));
        return res;
    }
    summary(endedBy) {
        return {
            attempt: this.attempts.length + 1,
            actions: this.history,
            outcome: this.env.outcome,
            steps: this.env.stepCount,
            native_total_reward: this.env.cumulativeReward,
            collisions: this.env.collisions,
            undo_used: this.undoUsedThisAttempt,
            ended_by: endedBy,
        };
    }
    /** Restart the mission from the start cell (counts a restart; unfinished attempts are logged). */
    restart() {
        if (!this.env.done && this.env.stepCount > 0)
            this.attempts.push(this.summary("restart"));
        this.restarts += 1;
        this.undoUsedThisAttempt = false;
        this.env.reset();
        return this.getState();
    }
    /** Alias of restart(). */
    reset() {
        return this.restart();
    }
    /**
     * PLAY FEATURE (not part of the simulator): restart + replay the history minus the last action.
     * Works also after the episode ended. Returns false if there is nothing to undo.
     */
    undo() {
        const hist = this.history;
        if (!hist.length)
            return false;
        if (this.env.done)
            this.attempts.pop();
        this.env.reset();
        for (const a of hist.slice(0, -1))
            this.env.step(a);
        this.undoCount += 1;
        this.undoUsedThisAttempt = true;
        return true;
    }
    getState(includeTrajectory = true) {
        return this.env.getState(includeTrajectory);
    }
    metrics() {
        const traj = this.env.trajectory;
        const o = this.env.outcome;
        return {
            steps: this.env.stepCount,
            collisions: this.env.collisions,
            hazards_entered: traj.filter((t) => t.hazard).length,
            outcome: o,
            success: o === "success",
            failure: o === "hazard" || o === "timeout",
            timeout: o === "timeout",
            native_total_reward: this.env.cumulativeReward,
            restarts: this.restarts,
            undo_count: this.undoCount,
            undo_used: this.undoUsedThisAttempt,
            attempt: this.attempts.length + (this.env.done ? 0 : 1),
        };
    }
    score() {
        return computeScore(this.env.outcome, this.env.stepCount, this.env.collisions, this.astarLen);
    }
    compareWithAStar() {
        return compareWithAStar(this.env.trajectory, this.env.scenario);
    }
    /** Current attempt as input for Python `replay_episode(actions, scenario, ...)`. */
    exportReplayInput() {
        return {
            actions: this.history,
            scenario: this.env.scenario.toDict(),
            hazard_terminates: this.env.hazardTerminates,
            reward_config: { ...this.env.rewardConfig },
        };
    }
}
