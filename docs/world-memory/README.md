# Isolated native720 visual memory prototype

Branch `feature/worldshift-spatial-memory-backend`, based on frozen release6423304. No production8000 edits, no RescueGame/PPO changes, no Cursor UI completion claim. Review API_CONTRACT.md implementation-status paragraph before using planned endpoints. OBSTACLE_SCHEMA_PROPOSAL.md is a coordination draft; offline analysis is not activated in the API.

On this Windows PC, in PowerShell:

```powershell
Set-Location 'C:\Users\filma\Documents\Codex\2026-10-10\wo\work\native720-quality'
.\experiments\Start-Native720.ps1
Invoke-RestMethod http://127.0.0.1:8002/health
```

Uses the accepted Python environment without modifying its packages. GPU weights must already be cached; launcher sets HF_HUB_OFFLINE=1. SDXLBase cache is local to experiments/backend/models/hf. To download pinned SDXLBase first, run experiments/download_sdxl.py with that environment while no test inference is active, with HF_HUB_OFFLINE unset. Native720 Waypoint uses the existing HF cache. Only one benchmark/client may own GPU generation; disconnect the production world before testing. Production8000 may remain loaded as fallback. Vite4834 is isolated, with `/engine` proxy to8002. Read health until model_loaded and statusready; it is asynchronous startup. Never terminate unrelated Python processes or overwrite occupied ports.

Generate a HIGH seed through existing /scenes/generate (30steps default, optional seed/style), poll its job and use ready metadata.world_start_request with /world/start. Reuse /scenes saved images if generation fails. Then use the existing JPEG WebSocket protocol and the current session ID for memory routes. Save at least five checkpoints, GET their real image URLs, and restore a visually reviewed earlier one. `accept_unreviewed:true` is an explicit experimental override, never automated approval. Reset always uses the original seed even after checkpoint restoration. New worlds have new IDs and navigation segments.

Checkpoints are raw encoded images without a second GPU readback. Initial seed and periodic candidates are saved; weak image indicators do not certify coherent content. Navigation estimates use only applied generated batches and nominal model time. They are arbitrary units, not meters. Map rendering belongs to Cursor; backend provides trajectory JSON only. Archives survive on disk but sessions are not resumed across process restarts. Limits:32 checkpoints/world,2048 trajectory points,8 world folders,256MiB total image budget. Quota507 is explicit; archive evidence outside the world_memory directory before continuing tests.

Reproduce core tests:

```powershell
$env:PYTHONPATH=(Resolve-Path 'experiments/backend').Path
& 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe' -m unittest discover -s experiments/tests -v
node experiments/test-memory-gpu.mjs
npm run build
```

GPU test writes a unique run folder under outputs/world-memory; requires saved scene9778710e48214c62827fa991a313ec91 on this PC. Replace that ID with your generated scene ID when reproducing on another checkout. It measures genuine protocol frames, not browser FPS. Browser test: http://127.0.0.1:4834/recovery-benchmark.html, saved scene ID, trajectory mixed, recovery none, Run60. Keep visible for displayed-FPS measurements. Evidence samples are real decoded frames; sampled video FPS is not generation FPS.

Optional OFFLINE CPU obstacle analysis (after GPU tests, not during benchmark):

```powershell
& 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe' experiments/analyze-checkpoint-cpu.py --image '<raw checkpoint file>' --checkpoint-json '<saved checkpoint JSON>' --output '<evidence directory>' --cache 'C:\Users\filma\Documents\Codex\2026-10-10\wo\work\vision-models' --depth-revision 5426e4f0f36572d16453bbda7a8389317b1bef99 --detector-revision cbc355fb364588351c5d51c7f74465e8e7ec6f72
```

Model parameters are forced to CPU, thread cap4. Output preserves checkpoint ID and SHA256, relative within-image depth, detector scores and estimated camera association. World obstacle coordinates are null. No enhanced image is used as evidence. Weak/duplicate detections need review. No calibrated meters, collision validation or navigable geometry is produced. Do not expose proposed fields until Cursor agrees the schema.

Current judging recommendation: keep accepted release as fallback. Native720 improves pixel resolution, not guaranteed temporal coherence. Later checkpoints can still smear. Enhancement, automatic semantic recovery, obstacle API and full Cursor map integration remain incomplete; do not present them as finished.
