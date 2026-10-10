/**
 * Framework-independent input controller implementing the Rescue Mission CONTROL CONTRACT
 * (t17u, tap + hold-to-repeat; see CONTROL_CONTRACT.md). It only calls RescueGame.step /
 * restart / undo and reads the step result / trajectory - there is no rule logic here, and a
 * blocked move is never predicted: it is detected only from the frozen env's own step result.
 */
import { type Action, type ActionName } from "./actions.js";
import type { SimState } from "./env.js";
import type { RescueGame } from "./game.js";
/** Minimal keyboard-event shape (a DOM KeyboardEvent satisfies it). */
export interface KeyEventLike {
    key: string;
    code?: string;
    repeat?: boolean;
    preventDefault?(): void;
}
export type ControlEventType = "step" | "hold_step" | "hold_stopped_collision" | "restart" | "undo" | "toggle_astar" | "flash_end" | "ignored_repeat" | "ignored_held" | "ignored_done" | "ignored_inactive" | "ignored_key";
export interface ControlEvent {
    type: ControlEventType;
    source: "keyboard" | "dpad" | "hold" | "api";
    action: Action | null;
    /** True when this event was a step and that step was a collision (blocked move). */
    collision: boolean;
    /** Episode finished (terminated or truncated) after the event. */
    done: boolean;
    /** Whether the A* overlay should be shown (only togglable after the episode ended). */
    showAStar: boolean;
}
export interface Scheduler {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
export interface StepControllerOptions {
    /** Called after every event that changed something (steps, restart, undo, toggle_astar, flash_end). */
    onChange?(state: SimState, event: ControlEvent): void;
    /** Return false while mission controls are inactive (e.g. a form field has focus). Default: always active. */
    isActive?(): boolean;
    /** Optional movement key map (lower-case `key` or `code` -> action). Default: `keyToAction`. */
    keyMap?: Record<string, Action>;
    /** Enable the U key as undo (only during an active episode). Default true. */
    enableUndo?: boolean;
    /** Hold-to-repeat interval in ms (first repeat after one interval). Default 200; 0 disables hold. */
    holdRepeatMs?: number;
    /** Duration of the collision flash (`collisionFlash` true) in ms. Default 350; 0 disables the timer. */
    collisionFlashMs?: number;
    /** Timer functions, injectable for tests. Default: globalThis.setTimeout / clearTimeout. */
    scheduler?: Scheduler;
}
export interface StepController {
    handleKeyDown(ev: KeyEventLike): ControlEvent;
    handleKeyUp(ev: KeyEventLike): void;
    /** Window blur: forget held keys and stop any hold so the next press steps again. */
    handleBlur(): void;
    /** document.visibilityState === "hidden": same as handleBlur(). */
    handleVisibilityHidden(): void;
    /** On-screen D-pad: exactly one step per call (no hold). */
    press(action: Action | ActionName): ControlEvent;
    restart(): ControlEvent;
    /** Undo the last step (play feature). Refused after the episode is done. Cancels any hold. */
    undo(): ControlEvent;
    toggleAStar(): ControlEvent;
    /** Stop all timers and ignore all further input. */
    dispose(): void;
    readonly game: RescueGame;
    /** True while movement is allowed (episode not finished, not disposed). */
    readonly canMove: boolean;
    /** Collision flag of the most recent step (false after restart). */
    readonly lastCollision: boolean;
    /** True for `collisionFlashMs` after a colliding step - drive the brief collision cue from this. */
    readonly collisionFlash: boolean;
    /** True while a hold-repeat timer is armed. */
    readonly holding: boolean;
    readonly showAStar: boolean;
    /** Currently held (pressed, not yet released) key ids. */
    readonly heldKeys: ReadonlySet<string>;
}
/** Create a controller for `game`. See CONTROL_CONTRACT.md for the rules it implements. */
export declare function createStepController(game: RescueGame, opts?: StepControllerOptions): StepController;
