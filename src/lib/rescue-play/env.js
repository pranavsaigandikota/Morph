/**
 * RescueEnvTS - exact port of the frozen Python `rescue_sim.env.RescueEnv` step rules
 * (observations are not ported; use getState()).
 */
import { ACTION_NAMES, ACTIONS, parseAction } from "./actions.js";
import { r10 } from "./pyround.js";
import { key, Scenario } from "./scenario.js";
export const STATE_VERSION = 1;
export const COORDINATE_SYSTEM = {
    format: "[x, y]",
    origin: "top-left",
    x_axis: "right",
    y_axis: "down",
    grid_indexing: "grid[y][x]",
    actions: { "0": "up (y-1)", "1": "down (y+1)", "2": "left (x-1)", "3": "right (x+1)" },
};
/** Defaults identical to Python RewardConfig. */
export const DEFAULT_REWARDS = { goal: 10.0, step: -0.1, collision: -1.0, hazard: -5.0 };
export function resolveRewards(rc) {
    const out = { ...DEFAULT_REWARDS };
    const unknown = Object.keys(rc ?? {}).filter((k) => !(k in DEFAULT_REWARDS)).sort();
    if (unknown.length)
        throw new Error(`unknown reward keys: [${unknown.map((k) => `'${k}'`).join(", ")}]`);
    for (const k of Object.keys(rc ?? {})) {
        out[k] = Number(rc[k]);
    }
    return out;
}
const copyCell = (c) => [c[0], c[1]];
export class RescueEnvTS {
    /** Loads + validates the scenario (Python `Scenario.from_dict`) and resets. */
    constructor(scenario, opts = {}) {
        this.stepCount = 0;
        /** Unrounded running sum of rounded per-step rewards (exactly as Python). */
        this.cumulative = 0.0;
        this.terminated = false;
        this.truncated = false;
        this.outcome = null;
        this.collisions = 0;
        this.trajectory = [];
        let sc = Scenario.fromDict(scenario instanceof Scenario ? scenario.toDict() : scenario);
        if (opts.maxSteps !== undefined && opts.maxSteps !== null) {
            sc = Scenario.fromDict({ ...sc.toDict(), max_steps: opts.maxSteps });
        }
        this.scenario = sc;
        this.rewardConfig = resolveRewards(opts.rewardConfig);
        this.hazardTerminates = opts.hazardTerminates ?? true;
        this.agentPos = copyCell(sc.start);
        this.reset();
    }
    get done() {
        return this.terminated || this.truncated;
    }
    get cumulativeReward() {
        return r10(this.cumulative);
    }
    info(collision = false, hazard = false) {
        return {
            outcome: this.outcome,
            collision,
            hazard,
            position: copyCell(this.agentPos),
            step_count: this.stepCount,
            cumulative_reward: r10(this.cumulative),
            collisions: this.collisions,
        };
    }
    /** Back to the scenario start (Python `reset()` with the same scenario). Returns the reset info. */
    reset() {
        this.agentPos = copyCell(this.scenario.start);
        this.stepCount = 0;
        this.cumulative = 0.0;
        this.terminated = false;
        this.truncated = false;
        this.outcome = null;
        this.collisions = 0;
        this.trajectory = [];
        return this.info();
    }
    /** Exact port of Python `RescueEnv.step`. Throws after the episode ended and on invalid actions. */
    step(action) {
        if (this.done)
            throw new Error("episode is over; call reset()");
        const a = parseAction(action);
        const rc = this.rewardConfig;
        const sc = this.scenario;
        const frm = this.agentPos;
        const [dx, dy] = ACTIONS[a];
        const target = [frm[0] + dx, frm[1] + dy];
        let reward = rc.step;
        let collision = false;
        let hazard = false;
        if (!sc.inBounds(target) || sc.obstacleSet.has(key(target[0], target[1]))) {
            collision = true;
            reward += rc.collision;
            this.collisions += 1;
        }
        else {
            this.agentPos = target;
            if (sc.hazardSet.has(key(target[0], target[1]))) {
                hazard = true;
                reward += rc.hazard;
                if (this.hazardTerminates) {
                    this.terminated = true;
                    this.outcome = "hazard";
                }
            }
            if (target[0] === sc.goal[0] && target[1] === sc.goal[1]) {
                reward += rc.goal;
                this.terminated = true;
                this.outcome = "success";
            }
        }
        this.stepCount += 1;
        if (!this.terminated && this.stepCount >= sc.maxSteps) {
            this.truncated = true;
            this.outcome = "timeout";
        }
        reward = r10(reward);
        this.cumulative += reward;
        this.trajectory.push({
            step: this.stepCount,
            action: a,
            action_name: ACTION_NAMES[a],
            from: copyCell(frm),
            to: copyCell(this.agentPos),
            reward,
            collision,
            hazard,
            terminated: this.terminated,
            truncated: this.truncated,
            outcome: this.outcome,
        });
        return { reward, terminated: this.terminated, truncated: this.truncated, info: this.info(collision, hazard) };
    }
    /** Same JSON shape as Python `env.get_state()`. */
    getState(includeTrajectory = true) {
        const d = this.scenario.toDict();
        const state = {
            state_version: STATE_VERSION,
            coordinate_system: JSON.parse(JSON.stringify(COORDINATE_SYSTEM)),
            seed: d.seed,
            width: d.width,
            height: d.height,
            walls: d.walls,
            doors: d.doors,
            blocked: d.blocked,
            hazards: d.hazards,
            start: d.start,
            goal: d.goal,
            max_steps: d.max_steps,
            agent: copyCell(this.agentPos),
            step_count: this.stepCount,
            terminated: this.terminated,
            truncated: this.truncated,
            done: this.done,
            outcome: this.outcome,
            cumulative_reward: r10(this.cumulative),
            collisions: this.collisions,
            hazard_terminates: this.hazardTerminates,
            reward_config: { ...this.rewardConfig },
            scenario: this.scenario.toDict(),
        };
        if (includeTrajectory)
            state.trajectory = this.trajectory.map((t) => ({ ...t, from: copyCell(t.from), to: copyCell(t.to) }));
        return state;
    }
    /** Python `env.get_trajectory()`. */
    getTrajectory() {
        return {
            scenario_seed: this.scenario.seed,
            length: this.trajectory.length,
            actions: this.trajectory.map((t) => t.action),
            steps: this.getState(true).trajectory,
        };
    }
}
/** Exact port of Python `replay_episode(actions, scenario, reward_config, hazard_terminates)`. */
export function replayEpisode(actions, scenario, opts = {}) {
    const sc = scenario instanceof Scenario ? scenario : Scenario.fromDict(scenario);
    const parsed = actions.map(parseAction);
    const env = new RescueEnvTS(sc, { rewardConfig: opts.rewardConfig, hazardTerminates: opts.hazardTerminates ?? true });
    let executed = 0;
    for (const a of parsed) {
        if (env.done)
            break;
        env.step(a);
        executed += 1;
    }
    const st = env.getState(false);
    return {
        replay_version: 1,
        scenario: env.scenario.toDict(),
        reward_config: { ...env.rewardConfig },
        hazard_terminates: env.hazardTerminates,
        actions: parsed.slice(0, executed),
        unused_actions: parsed.length - executed,
        trajectory: env.getTrajectory().steps,
        final_state: {
            agent: st.agent, step_count: st.step_count, terminated: st.terminated, truncated: st.truncated,
            done: st.done, collisions: st.collisions,
        },
        outcome: st.outcome,
        total_reward: st.cumulative_reward,
    };
}
