# WorldShift: Create. Explore. Survive. Adapt.

The existing Create World page now accepts arbitrary environment descriptions, an optional visual style, and an optional reproducible generation seed. Local SDXL Turbo generates a PNG; Waypoint initializes from that PNG and generates interactive first-person video. Waypoint does not interpret text. The inference engine, FP8 configuration and original benchmark files are unchanged.

## Windows startup

Run these in separate PowerShell terminals. Do not start a second backend if `/health` is already ready.

```powershell
Set-Location 'C:\Users\filma\Documents\Morph\Codex Plus'
Invoke-RestMethod http://127.0.0.1:8000/health
# If no service is running:
.\start-with-scenes.ps1 -Port 8000
```

```powershell
Set-Location 'C:\Users\filma\Documents\Morph\Cursor Pro\WorldShift'
npm.cmd run dev
```

Open `http://127.0.0.1:4821/create`. The existing environment and model cache are installed on this PC. The original `.\start.ps1 -Port 8000` is the inference-only fallback; it does not expose `/scenes`. Both launchers use one worker. Startup compilation can take tens of seconds before the first frame; sustained measurements begin after warmup.

## Judge demonstration

1. Describe a world, optionally set style and seed, and click Generate World. Actual model phases/denoising steps appear. A blank seed selects and saves a random uint32 seed.
2. Inspect the real PNG preview, then Start Exploring. Use WASD; hold left mouse and drag on the video if pointer capture fails. Pause freezes generation; Resume continues.
3. Select Create World to leave the current session. The client stops its owned world. Generate a different description, or select a saved scene card and Start Exploring. No model reload or application restart is needed per scene.
4. If generation returns409 while cleanup finishes, wait briefly and retry. A paused world still owns the GPU: stop/disconnect before submitting SDXL.

The server-persisted gallery includes six curated images: cyberpunk street, enchanted forest, alien canyon, underwater base corridor, floating islands and a Florida neighborhood after a hurricane. Prompts/styles/seeds, hashes, dimensions, model revision and ready-to-use `world_start_request` are in `presets/manifest.json` and individual JSON files. Perspective is constrained in the prompt and checked visually, not guaranteed by a classifier. The underwater image is a mechanical corridor; some requested glass/coral detail is absent. Background figures in two presets are other inhabitants, not a third-person player avatar.

The presets are already installed on this PC. To import the bundled images into another copy of the same backend, run `Import-DemoPresets.ps1 -BackendRoot '<backend folder>'` from the extracted bundle. It verifies image hashes and rewrites local seed paths for new scenes; existing identical scenes are preserved. `-CheckOnly` verifies without writing. Restarting the service is not required for imported scenes to appear in GET `/scenes`.

## Reliability and recovery

- Pointer lock still fails in the tested in-app browser. Both Promise/synchronous failures and `pointerlockerror` now display the drag fallback. Test successful capture in your intended presentation browser before relying on it. Drag-look is verified.
- Reconnect reopens the same world WebSocket/history. Reset clears autoregressive state, reapplies the original seed and advances epoch; position/history are lost, and paused state is retained. Stop releases the session while leaving Waypoint weights loaded.
- Long exploration can drift or lose scene semantics. Reset is the validated recovery. Official `WorldEngine.reset()` clears KV cache, timestamps/context and VAE state. No cache tuning, periodic reseeding, geometry reconstruction or collision assumptions were added. State snapshots are not a validated drift repair.
- Saved-image fallback avoids SDXL/download dependencies. Select a gallery card. The predefined facility is always available at `/world` without a seed query; explicitly leaving the generated-world URL is necessary to choose it.
- For422 shorten invalid descriptions, seeds or styles. Combined first-person prefix + description + style must fit both SDXL77-token tokenizers; overflow appears as a job error. SDXL may miss semantic details and Waypoint may drift on scenes outside its training distribution.
- For409 stop the active session or await the current job. For503 wait for `/health` model readiness. Inspect backend logs for GPU/model failures; there is no silent mock substitution. Interrupted image jobs persist as errors.
- For CORS/WebSocket rejection use the existing Vite `/engine` proxy, or add the exact frontend origin to `WORLDSHIFT_ORIGINS` before starting the backend. Preserve allowed defaults. Direct8000 endpoint and proxy4821 endpoint are documented in `FRONTEND_INTEGRATION.md`.

## Explanation for judges

“We turn a description into a first-person seed using local SDXL Turbo. A separate Waypoint1.5 image-conditioned world model then predicts real video batches from frame history and WASD/mouse controls. FP8 quantization keeps inference practical on our16GB GPU. In the new React forest test we measured70.81 genuine generated FPS and17.93 canvas-drawn FPS over77.5seconds, with zero transport/decode errors. The browser deliberately skips presentation frames to keep input responsive. This is generated video, not a persistent physics simulation: collisions, geometry consistency and long-term scene identity are not guaranteed.”

Read `CREATE_ANYTHING_RESULTS.md` for measurements and `SCENE_API.md` for exact Cursor contracts. No RescueEnv, PPO or third-person code changed.
