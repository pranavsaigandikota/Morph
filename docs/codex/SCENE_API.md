# Local natural-language scenes

Run `start-with-scenes.ps1` for these optional routes. `start.ps1` preserves inference-only behavior. The combined service imports the unchanged Waypoint service and uses its single GPU executor and lifecycle lock. Waypoint stays resident. SDXL Turbo uses sequential CPU offload and remains cached on CPU between jobs. **Stop the current world first**, including paused worlds. No image generation overlaps Waypoint generation.

## Submit and poll

`POST /scenes/generate`, JSON:

```json
{"prompt":"An industrial research corridor with teal lights, metal floors and computer consoles","style":"cinematic","seed":20261010,"steps":4,"perspective":"first_person"}
```

Prompt: printable nonempty text, max500 characters, also checked against both model tokenizers' 77-token limits. Requests naming third-person, aerial, selfie or over-the-shoulder views are rejected. Seed: optional null or integer0..4294967295; server saves a random seed when omitted. Steps: integer1..4, default4. Perspective only `first_person`. Style: optional null or printable nonempty string1..80 characters; the same first-person validation applies. Style is appended as `, visual style: <style>` to the unchanged existing effective prompt. Prompt plus style and prefix must fit both77-token tokenizers. No CFG/negative-prompt knobs are exposed.

HTTP202:

```json
{"job_id":"<32 hex characters>","status":"queued","poll_url":"/scenes/jobs/<job_id>"}
```

`GET /scenes/jobs/<job_id>` returns `job_id`, nullable `scene_id`, `status` (`queued/running/ready/error`), `phase`, prompt, seed, steps, perspective, step, total_steps, created_at, nullable error, and optional updated_at/metadata. Phases include waiting_for_gpu, downloading_image_model, loading_image_model, encoding_prompt, denoising, saving, ready/error. Poll about every500ms. Step counts represent actual denoising callbacks; they are not an ETA or byte-level download percentage.

When ready, `metadata` includes scene_id, kind:"generated", requested/effective prompts, style, seed, perspective, model, revision, steps, guidance_scale, model/output dimensions, UTC creation timestamp, image SHA256, image URL, generation/total seconds, process peak VRAM, and **world_start_request**. POST that request unchanged to existing `/world/start`, then connect `/world/stream?session_id=...`. Waypoint receives the generated image through its validated seed-conditioning path, not a text embedding.

## List, preview and reuse

| Method | Response |
|---|---|
| `GET /scenes?limit=20&offset=0` | `{scenes:[metadata...],total,limit,offset}`; limit1..100 |
| `GET /scenes/<scene_id>` | Metadata including image_url/world_start_request |
| `GET /scenes/<scene_id>/image` | Real PNG for generated scenes; JPEG for predefined facility |

Generated files persist at `saved_scenes/<scene_id>/seed.png`, `scene.json`, `job.json`. Predefined `facility` is always listed as fallback. Saved jobs interrupted by process exit are marked error on startup. IDs are validated against path traversal. Failed jobs remain inspectable; no synthetic seed is substituted. React's existing Create World adapter polls these jobs, displays actual phases, then stores a browser bookmark to the server-persisted image/scene ID. The existing React gallery now reads the server listing and merges browser bookmarks. It exposes optional style/uint32 generation-seed inputs without rebuilding the frontend. The scene ID used for exploration differs from the numeric SDXL generation seed.

## Errors

409: active world or another scene job; stop world/wait for current job. `/world/start` also returns409 during image generation. 422: invalid request; tokenizer overflow becomes a job error. 404: unknown or unfinished saved scene. GPU/model/download failures become `status:"error"` with a meaningful error; Waypoint remains independently loaded. Avoid infinite job polling in production by offering user cancellation/timeouts in the client; no server cancellation endpoint is invented.

## Tested configuration

Local `stabilityai/sdxl-turbo`, revision `71153311d3dbb46851df1931d3ca6e939de83304`, FP16,4steps, guidance0. Generated640Ã—384, center fitted640Ã—360. Model files are cached under backend `models/hf`, outside the benchmark environment. Existing GPU package versions were reused; no benchmark packages were changed. CPU offload and VAE tiling fit the combined process on16GB.

The first successful API image took8.03s (5.12s generation); the React-generated warm image took3.85s (3.51s generation), with7220MiB phase peak PyTorch reserved memory. Waypoint load count stayed1. The resulting seed sustained69.65 genuine generated FPS over a67.99s server measurement window. These are measured results, not predicted speed or guaranteed scene coherence. Model cards/configuration provenance: https://huggingface.co/stabilityai/sdxl-turbo . Perspective is guided by prompting/validation, not guaranteed by a visual classifier.

Example Cursor flow:

```javascript
const api = '/engine'; // Vite dev proxy
const r = await fetch(api+'/scenes/generate', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({prompt:'A futuristic research corridor',steps:4,
    perspective:'first_person'})
});
if(!r.ok) throw new Error(await r.text());
const {poll_url} = await r.json();
let job;
do {
  await new Promise(r=>setTimeout(r,500));
  const response = await fetch(api+poll_url);
  if(!response.ok) throw new Error(await response.text());
  job = await response.json();
  console.log(job.phase,job.step,job.total_steps);
  if(job.status==='error') throw new Error(job.error);
} while(job.status!=='ready');
const start = await fetch(api+'/world/start', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify(job.metadata.world_start_request)
});
if(!start.ok) throw new Error(await start.text());
const {session_id} = await start.json();
// Connect /engine/world/stream?session_id=... using the documented JPEG protocol.
```

## Creative worlds and reproducibility

The service has no disaster-only category restriction. Example descriptions and six real reusable images are in `presets/manifest.json`: cyberpunk street, enchanted forest, alien planet, underwater base, floating islands, Florida hurricane neighborhood. The same prompt/style/seed/steps/model revision/runtime reproduced an identical PNG SHA256 in the tested process. Cross-version/hardware byte identity is not promised. Style changes the text-to-image prompt only; it is not a Waypoint parameter.

Switching: POST `/world/stop` for the owned active session, await completion and health ready, then submit another `/scenes/generate` or reuse GET `/scenes/<id>`. POST the returned `world_start_request` unchanged to `/world/start`; open a new WebSocket for its new session ID. Reconnect applies to the same session; it does not switch seeds. Reset reapplies the original seed. SDXL jobs and Waypoint video inference remain sequential; weights are not reloaded per scene.

For direct requests use `http://127.0.0.1:8000`. The current React development proxy uses `/engine` for HTTP and `ws://127.0.0.1:4821/engine/world/stream?session_id=<id>` for streaming. There is no `/stream` endpoint or custom binary batch envelope. Consult FRONTEND_INTEGRATION.md and world-client.js for the exact JSON-plus-JPEG transport.
