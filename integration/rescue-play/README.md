# Rescue Play v1 (frozen handoff)

**Source branch:** `integration/rescue-play-v1` @ `6a01103`  
**ZIP:** `rescue_play.zip`  
**SHA-256:** `51c463fe68cd6bd34216400223d4d04d65d2a6e5c0cba5d9392e43a97ad8c644`

Vendored into the app as:

- `src/lib/rescue-play/` ← package `dist/` (includes `createStepController`)
- `public/data/rescue-play/` ← missions + manifest

Authoritative docs (from the ZIP / PR #2 handoff):

- `CURSOR_HANDOFF.md`
- `INTEGRATION.md`
- `CONTROL_CONTRACT.md` (t17u)
- `BROWSER_VALIDATION.md`
- `FREEZE.md`

Do **not** reimplement step/collision/scoring rules. Route all `/mission` input through `createStepController`.
