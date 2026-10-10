# Rescue Play v1 handoff package

This directory is the **v1** handoff of WorldShift AI **Rescue Play**: a zero-dependency, browser-ready TypeScript game engine (`@worldshift/rescue-play`) plus missions, data, tests, QA media, and docs. The archive is `rescue_play.zip`. It is additive. Older packages elsewhere in the repo, including anything under `public/data/rescue/`, are untouched.

## Checksum

```
51c463fe68cd6bd34216400223d4d04d65d2a6e5c0cba5d9392e43a97ad8c644  rescue_play.zip
```

The sidecar `rescue_play.zip.sha256` holds that line. Verify from this directory:

```bash
sha256sum -c rescue_play.zip.sha256
```

On Windows (PowerShell):

```powershell
Get-FileHash -Algorithm SHA256 .\rescue_play.zip
```

The hash must equal `51c463fe68cd6bd34216400223d4d04d65d2a6e5c0cba5d9392e43a97ad8c644`.

## Frozen engine

This is **v1**. The engine and simulation mechanics are frozen. See `FREEZE.md` inside the zip (and `reports/engine_freeze.json`). Do not re-implement the step rules in the frontend.

Automated browser tests and unit tests passed (`npm test`: 208 tests; parity Python→TS 17,842 steps / TS→Python 40,846 steps, 0 mismatches). **Physical keyboard hold-to-repeat has not been verified by a human.** The OS automation tool cannot hold keys. CDP-level browser tests and unit tests cover hold-to-repeat; the manual check in `BROWSER_VALIDATION.md` is still recommended.

## Integrate

1. Confirm the checksum above.
2. Unzip `rescue_play.zip`.
3. Follow `CURSOR_HANDOFF.md` in this directory (the same document is inside the zip).
4. Copy `data/rescue-play/` from the unzipped package to `public/data/rescue-play/` in this frontend repo (the handoff text says `frontend/public/data/rescue-play/`; here that path is `public/data/rescue-play/`).
5. Vendor `dist/` or add the package as a `file:` dependency, then wire the controller as the handoff describes. Leave `/data/rescue/` and `/data/rescue-unguided/` alone.
