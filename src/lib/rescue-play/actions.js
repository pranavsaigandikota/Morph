/** Action ids, names and parsing - port of rescue_sim.pathfinding / env.parse_action. */
import { pyRepr } from "./pyrepr.js";
/** [dx, dy]; y grows downward. */
export const ACTIONS = {
    0: [0, -1],
    1: [0, 1],
    2: [-1, 0],
    3: [1, 0],
};
export const ACTION_NAMES = { 0: "up", 1: "down", 2: "left", 3: "right" };
export const NAME_TO_ACTION = { up: 0, down: 1, left: 2, right: 3 };
/** Raised for invalid actions; same messages as the Python ValueError. */
export class ActionError extends Error {
    constructor(message) {
        super(message);
        this.name = "ActionError";
    }
}
/** Port of Python `parse_action`: 0-3 or 'up'/'down'/'left'/'right' (trimmed, case-insensitive). */
export function parseAction(action) {
    if (typeof action === "string") {
        const k = action.trim().toLowerCase();
        if (k in NAME_TO_ACTION)
            return NAME_TO_ACTION[k];
        throw new ActionError(`invalid action ${pyRepr(action)}`);
    }
    if (typeof action === "boolean")
        throw new ActionError(`invalid action ${pyRepr(action)}`);
    if (typeof action === "number" && Number.isInteger(action) && action >= 0 && action <= 3)
        return action;
    throw new ActionError(`invalid action ${pyRepr(action)}; expected 0-3 or up/down/left/right`);
}
const KEY_MAP = {
    arrowup: 0, w: 0, keyw: 0, up: 0,
    arrowdown: 1, s: 1, keys: 1, down: 1,
    arrowleft: 2, a: 2, keya: 2, left: 2,
    arrowright: 3, d: 3, keyd: 3, right: 3,
};
/**
 * Map a keyboard `KeyboardEvent.key` or `.code` (ArrowUp/Down/Left/Right, w/a/s/d, KeyW/KeyA/KeyS/KeyD)
 * to an action, or `null` if the key is not a movement key. Play-layer helper (not in Python).
 */
export function keyToAction(keyOrCode) {
    const a = KEY_MAP[String(keyOrCode).toLowerCase()];
    return a === undefined ? null : a;
}
