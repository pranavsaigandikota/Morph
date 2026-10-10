# Codex Create Anything handoff — **copy required**

These files are **not** present in the cloud agent workspace. Windows paths are not mounted, and no self-hosted Cursor worker is connected.

## Copy exactly (from your PC into this repo)

| Source (Windows) | Destination (this repo) |
|------------------|-------------------------|
| `C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\SCENE_API.md` | `docs/codex/SCENE_API.md` |
| `C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\CREATE_ANYTHING_DEMO.md` | `docs/codex/CREATE_ANYTHING_DEMO.md` |
| `C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\CREATE_ANYTHING_RESULTS.md` | `docs/codex/CREATE_ANYTHING_RESULTS.md` |
| `C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\WorldShift-Create-Anything-Demo.zip` | unzip → `docs/codex/demo/` (presets, fixtures, sample seeds if any) |

### PowerShell (run on the Windows machine in the Morph clone)

```powershell
cd C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift   # or your Morph clone path
New-Item -ItemType Directory -Force -Path docs\codex\demo | Out-Null
Copy-Item "C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\SCENE_API.md" docs\codex\
Copy-Item "C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\CREATE_ANYTHING_DEMO.md" docs\codex\
Copy-Item "C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\CREATE_ANYTHING_RESULTS.md" docs\codex\
Expand-Archive -Force "C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\WorldShift-Create-Anything-Demo.zip" docs\codex\demo\
git checkout cursor/game-experience-cd95
git add docs/codex
git commit -m "Add Codex Create Anything SCENE_API handoff"
git push origin cursor/game-experience-cd95
```

Or attach / paste `SCENE_API.md` into the Cursor agent chat.

## What we will wire once `SCENE_API.md` arrives (no guessing)

- Exact HTTP paths, request/response JSON for SDXL generate + presets
- Field names for reproducible `seed`, style enums, image URL / data URL
- How the six real presets (incl. Florida hurricane neighborhood) are listed
- Any auth / content-type requirements

Until then, `/create` keeps the provisional client (`sceneGeneration.ts`) that tries `/scenes/generate`, `/sdxl/generate`, `/generate` on the Waypoint origin — **not** claimed as the final Codex contract.

## Codex-reported Windows baseline (do not overwrite backend)

From Create Anything verification (Codex):

- **70.81** generated FPS / **17.93** canvas FPS over **77.5 s**
- Zero transport / decode errors
- Six reusable scene presets (incl. Florida hurricane neighborhood)
- Creative prompts, styles, reproducible seeds, world switching verified
- Waypoint inference pipeline preserved

Frontend must match this contract and preserve that pipeline — never replace the inference server.
