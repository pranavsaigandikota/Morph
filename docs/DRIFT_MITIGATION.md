# Explorer drift mitigation (frontend)

Waypoint is an autoregressive first-person video model. As the player walks away from the SDXL seed, rolling history can accumulate **visual / geometric drift**. This is a model-history limit, not a UI bug.

## What frontend can do (shipped)

| Lever | Behavior | Limit |
|---|---|---|
| **Idle hold** | After ~700 ms with no WASD/mouse, call `POST /world/pause`. Input resumes via `/world/resume`. | Stops standing-still mutation; does **not** undo walk-away drift. |
| **Reset seed** | `POST /world/reset` restores the cached seed image and clears accumulated history (visible jump). Auto-resumes if the session was paused. | Only reliable recovery for severe drift. |
| **Display sharpen + capped scale** | Mild canvas/CSS contrast; enlarge native 640×360 at most 2×. | Cosmetic. Cannot invent lost detail or persistent geometry. |

## What higher resolution does / does not do

Evaluating `Overworld/Waypoint-1.5-1B` (or any higher-res checkpoint) may improve texture sharpness **if** GPU quality tests pass. It does **not** guarantee persistent geometry or eliminate long-session drift. Keep the verified 360P / FP8 path as the stable fallback until results are published.

## Frozen backend

Do not rewrite inference hashes, wire format, or credit-window adapters for drift work. Use existing `pause` / `resume` / `reset` only.

## Experimental source

Local Windows experiments: `C:\Users\filma\Documents\Codex\2026-10-10\wo\work\clarity-idle`. Merge carefully against this branch without claiming quality wins before Waypoint-1.5 FP8 results land.
