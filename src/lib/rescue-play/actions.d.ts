export type Action = 0 | 1 | 2 | 3;
export type ActionName = "up" | "down" | "left" | "right";
/** [dx, dy]; y grows downward. */
export declare const ACTIONS: Readonly<Record<Action, readonly [number, number]>>;
export declare const ACTION_NAMES: Readonly<Record<Action, ActionName>>;
export declare const NAME_TO_ACTION: Readonly<Record<ActionName, Action>>;
/** Raised for invalid actions; same messages as the Python ValueError. */
export declare class ActionError extends Error {
    constructor(message: string);
}
/** Port of Python `parse_action`: 0-3 or 'up'/'down'/'left'/'right' (trimmed, case-insensitive). */
export declare function parseAction(action: unknown): Action;
/**
 * Map a keyboard `KeyboardEvent.key` or `.code` (ArrowUp/Down/Left/Right, w/a/s/d, KeyW/KeyA/KeyS/KeyD)
 * to an action, or `null` if the key is not a movement key. Play-layer helper (not in Python).
 */
export declare function keyToAction(keyOrCode: string): Action | null;
