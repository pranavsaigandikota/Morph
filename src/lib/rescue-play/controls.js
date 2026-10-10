/**
 * Framework-independent input controller implementing the Rescue Mission CONTROL CONTRACT
 * (t17u, tap + hold-to-repeat; see CONTROL_CONTRACT.md). It only calls RescueGame.step /
 * restart / undo and reads the step result / trajectory - there is no rule logic here, and a
 * blocked move is never predicted: it is detected only from the frozen env's own step result.
 */
import { keyToAction } from "./actions.js";
const keyId = (ev) => String(ev.code || ev.key).toLowerCase();
// Typed locally so the package needs neither DOM nor Node lib typings.
const timerHost = globalThis;
const defaultScheduler = {
    setTimeout: (fn, ms) => timerHost.setTimeout(fn, ms),
    clearTimeout: (h) => timerHost.clearTimeout(h),
};
/** Create a controller for `game`. See CONTROL_CONTRACT.md for the rules it implements. */
export function createStepController(game, opts = {}) {
    const held = new Set();
    const sched = opts.scheduler ?? defaultScheduler;
    const holdMs = Math.max(0, opts.holdRepeatMs ?? 200);
    const flashMs = Math.max(0, opts.collisionFlashMs ?? 350);
    const enableUndo = opts.enableUndo ?? true;
    let disposed = false;
    let lastCollision = false;
    let collisionFlash = false;
    let showAStar = false;
    /** The most recently pressed movement key drives the hold; no fallback to other held keys. */
    let driver = null;
    let holdTimer = null;
    let flashTimer = null;
    const active = () => !disposed && (opts.isActive ? opts.isActive() : true);
    const mapKey = (ev) => {
        if (opts.keyMap) {
            const a = opts.keyMap[ev.key.toLowerCase()] ?? (ev.code ? opts.keyMap[ev.code.toLowerCase()] : undefined);
            return a === undefined ? null : a;
        }
        const a = keyToAction(ev.key);
        return a !== null ? a : ev.code ? keyToAction(ev.code) : null;
    };
    const lastStepCollision = () => {
        const t = game.env.trajectory;
        return t.length > 0 && t[t.length - 1].collision;
    };
    const make = (type, source, action) => ({
        type,
        source,
        action,
        collision: type === "step" || type === "hold_step" || type === "hold_stopped_collision" ? lastCollision : false,
        done: game.done,
        showAStar,
    });
    const CHANGES = new Set(["step", "hold_step", "hold_stopped_collision", "restart", "undo", "toggle_astar", "flash_end"]);
    const emit = (ev) => {
        if (opts.onChange && CHANGES.has(ev.type))
            opts.onChange(game.getState(), ev);
        return ev;
    };
    const stopHold = () => {
        if (holdTimer !== null)
            sched.clearTimeout(holdTimer);
        holdTimer = null;
        driver = null;
    };
    const stopFlash = () => {
        if (flashTimer !== null)
            sched.clearTimeout(flashTimer);
        flashTimer = null;
        collisionFlash = false;
    };
    const startFlash = () => {
        stopFlash();
        collisionFlash = true;
        if (flashMs > 0) {
            flashTimer = sched.setTimeout(() => {
                flashTimer = null;
                collisionFlash = false;
                if (!disposed)
                    emit(make("flash_end", "api", null));
            }, flashMs);
        }
    };
    /** One env step; the collision flag is read back from the frozen env's trajectory. */
    const doStep = (action) => {
        game.step(action);
        lastCollision = lastStepCollision();
        if (lastCollision)
            startFlash();
        if (game.done)
            stopHold(); // rule 5
    };
    const scheduleHold = () => {
        holdTimer = sched.setTimeout(onHoldTick, holdMs);
    };
    function onHoldTick() {
        holdTimer = null;
        const d = driver;
        if (!d || disposed || game.done || !active() || !held.has(d.id)) {
            stopHold();
            return;
        }
        doStep(d.action);
        if (lastCollision) {
            // rule 4: penalty applied once by the env; halt until the key is released and pressed again
            stopHold();
            emit(make("hold_stopped_collision", "hold", d.action));
            return;
        }
        if (!game.done)
            scheduleHold();
        emit(make("hold_step", "hold", d.action));
    }
    const keyStep = (id, action) => {
        stopHold(); // most recent key drives
        if (game.done)
            return make("ignored_done", "keyboard", action);
        doStep(action);
        if (holdMs > 0 && !lastCollision && !game.done) {
            driver = { id, action };
            scheduleHold();
        }
        return emit(make("step", "keyboard", action));
    };
    const restart = (source = "api") => {
        if (disposed)
            return make("ignored_inactive", source, null);
        stopHold();
        stopFlash();
        game.restart();
        held.clear();
        lastCollision = false;
        showAStar = false;
        return emit(make("restart", source, null));
    };
    const undo = (source = "api") => {
        if (disposed)
            return make("ignored_inactive", source, null);
        // rule 7: undo would revive a finished episode; Restart is the only way to a new attempt
        if (game.done)
            return make("ignored_done", source, null);
        stopHold(); // cancels any active hold (the key must be released and pressed again)
        if (!game.undo())
            return make("ignored_key", source, null);
        lastCollision = lastStepCollision();
        stopFlash();
        showAStar = false;
        return emit(make("undo", source, null));
    };
    const toggleAStar = (source = "api") => {
        if (disposed)
            return make("ignored_inactive", source, null);
        showAStar = game.done ? !showAStar : false;
        return emit(make("toggle_astar", source, null));
    };
    const blur = () => {
        held.clear();
        stopHold();
    };
    return {
        game,
        get canMove() {
            return !disposed && !game.done;
        },
        get lastCollision() {
            return lastCollision;
        },
        get collisionFlash() {
            return collisionFlash;
        },
        get holding() {
            return holdTimer !== null;
        },
        get showAStar() {
            return showAStar;
        },
        get heldKeys() {
            return held;
        },
        handleKeyDown(ev) {
            if (!active())
                return make("ignored_inactive", "keyboard", null);
            const k = ev.key.toLowerCase();
            const action = mapKey(ev);
            if (action !== null) {
                ev.preventDefault?.(); // arrows / WASD never scroll while active
                if (ev.repeat)
                    return make("ignored_repeat", "keyboard", action); // OS repeat never steps
                const id = keyId(ev);
                if (held.has(id))
                    return make("ignored_held", "keyboard", action);
                held.add(id);
                return keyStep(id, action);
            }
            if (k === "r") {
                ev.preventDefault?.();
                if (ev.repeat)
                    return make("ignored_repeat", "keyboard", null);
                return restart("keyboard");
            }
            if (k === "h") {
                if (ev.repeat)
                    return make("ignored_repeat", "keyboard", null);
                return toggleAStar("keyboard");
            }
            if (k === "u" && enableUndo) {
                if (ev.repeat)
                    return make("ignored_repeat", "keyboard", null);
                return undo("keyboard");
            }
            return make("ignored_key", "keyboard", null);
        },
        handleKeyUp(ev) {
            const id = keyId(ev);
            held.delete(id);
            if (driver && driver.id === id)
                stopHold(); // stop immediately, no fallback
        },
        handleBlur: blur,
        handleVisibilityHidden: blur,
        press(action) {
            const a = typeof action === "string" ? keyToAction(action) : action;
            if (a === null || a === undefined)
                throw new Error(`invalid D-pad action ${String(action)}`);
            if (disposed)
                return make("ignored_inactive", "dpad", a);
            if (game.done)
                return make("ignored_done", "dpad", a);
            doStep(a);
            return emit(make("step", "dpad", a));
        },
        restart: () => restart("api"),
        undo: () => undo("api"),
        toggleAStar: () => toggleAStar("api"),
        dispose() {
            disposed = true;
            held.clear();
            stopHold();
            stopFlash();
        },
    };
}
