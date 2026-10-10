"""Build the evidence index, transition pairs and measured report after the GPU runs."""
import json,shutil
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(r'C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\recovery-evaluation')
OUT=ROOT.parent
summaries=json.loads((ROOT/'comparison/summary.json').read_text())
semantic=json.loads((ROOT/'comparison/semantic-diagnostic.json').read_text())
references=json.loads((ROOT/'approved-references.json').read_text())
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',18)
panes=[];jumps=[]
for s in summaries:
    r=json.loads((ROOT/s['id']/'report.json').read_text())
    for tr in r['transitions']:
        after=next(x for x in r['samples'] if x['epoch']==tr['epoch'])
        before=[x for x in r['samples'] if x['t']<after['t'] and x['epoch']<tr['epoch']][-1]
        tile=Image.new('RGB',(960,300),(12,20,28));d=ImageDraw.Draw(tile)
        for i,(sample,label) in enumerate(((before,'before'),(after,'after'))):
            im=Image.open(ROOT/s['id']/sample['file']).convert('RGB').resize((480,270));tile.paste(im,(i*480,30))
            d.text((i*480+4,5),f"{s['profile']}P {s['mode']} cycle {tr['cycle']} {label} t={sample['t']:.2f}s",font=font,fill='white')
        panes.append(tile);jumps.append({'run':s['id'],'cycle':tr['cycle'],'before':before,'after':after})
sheet=Image.new('RGB',(960,len(panes)*300),(12,20,28))
for i,t in enumerate(panes):sheet.paste(t,(0,i*300))
sheet.save(ROOT/'comparison/transition-pairs.jpg',quality=95)
(ROOT/'comparison/transition-index.json').write_text(json.dumps(jumps,indent=2))
for i,ref in enumerate(references['fresh'],1):shutil.copyfile(ref['world_start_request']['seed_image_path'],ROOT/f'fresh-reference-{i}.png')
lines=['# Visual recovery benchmark — approved SDXL candidate 1','',
'**Decision: NO-GO for claiming continuously clear, prompt-faithful 60-second exploration.** Native 720P with clean cached SDXL recovery is the most promising tested configuration, but smearing and distorted architecture remain. Recovery lifecycle passes; visual quality is not solved. No experimental change has been merged into the accepted release.','',
'## Inputs and scope','',
'User approved candidate 1 ("1 is good"). SDXL HIGH: 1280×720, 30 steps, CFG 5, Euler scheduler; seed 20261011; scene `9bda60c5d71a411680f71969c487684d`. Image SHA-256 `8b4d373fb652ca1c8fb81f0791c81916ced00caff76907743ca9d46ba2ee02f3`. Model `stabilityai/stable-diffusion-xl-base-1.0`, revision `462165984030d82259a11f4367a4eed129e94a7b`. Generation 9.52 s (9.73 s request total). Six real candidates and their metadata are under `candidates/`.','',
'Theme: '+references['original']['prompt'],'',
'The human-rejected early Waypoint checkpoint was never used as a recovery anchor. Repeated generated-checkpoint re-anchoring and accumulation are therefore NOT evaluated. Fresh references use the exact original prompt with seeds 20261012, 20261013 and 20261010. They are experimenter-reviewed SDXL inputs, not individually human-approved images. Raw inputs are copied as `fresh-reference-1.png` through `fresh-reference-3.png`. No enhanced or degraded generated frame is used as an anchor.','',
'## Method','',
'Six sequential live GPU sessions: 360P/720P × no recovery/original approved seed/fresh SDXL. Each measured run lasts 60 seconds after first frame and first canvas draw. Original and fresh cases restore at approximately 15, 30 and 45 seconds, using the existing checkpoint restore lifecycle and the same session ID. Three restores per recovery run; twelve in total. SDXL images were generated before exploration and cached; no concurrent SDXL or vision GPU inference occurred.','',
'Controls are sent every 50 ms: within each 12-second period, W for 6 s, A plus mouse_dx=0.5 for 2 s, S for 2 s, D plus mouse_dy=0.15 for 2 s. Controls are cleared during recovery. This is a mixed trajectory comparison; separate stationary/forward/slow-turn/rapid-turn runs are NOT part of this new matrix.','',
'The two profiles have identical initial images and timed control intent, but NOT identical generated-frame trajectories: 360P produces more action-conditioned steps each second. Faster inference can produce more movement/degradation under held input. This is an interactive profile comparison, not proof that resolution alone changes model stability. Each configuration has one run, with stochastic output; results need replication. A roughly 3.5-second frontend build ran around seconds 24–28 of the 720P original case; that run is not a pristine CPU-idle performance measurement.','',
'## Direct measurements','',
'| Profile | Recovery | Genuine generated FPS | Canvas FPS | Presentation skips | Server drops | Gaps / stale / decode errors | ACK p50 / p95 ms | Applied-control-to-draw p50 / p95 ms | Reserved / process peak MiB |',
'|---|---|---:|---:|---:|---:|---|---|---|---|']
for s in summaries:
    lines.append(f"| {s['profile']}P | {s['mode']} | {s['generated_fps']:.2f} | {s['canvas_fps']:.2f} | {s['presentation_skips']} | {s['server_drop_counter']} | {s['frame_gaps']} / {s['stale_frames']} / {s['decode_errors']} | {s['ack_p50_ms']:.1f} / {s['ack_p95_ms']:.1f} | {s['control_to_draw_p50_ms']:.1f} / {s['control_to_draw_p95_ms']:.1f} | {s['vram_reserved_mb']:.0f} / {s['process_peak_reserved_mb']:.0f} |")
lines+=['','All six runs: zero reported protocol errors and empty error arrays. Model load count remained 1 per profile process. Process peaks include warmup/initialization, and are PyTorch reserved memory, not total board VRAM. No OOM occurred. First-run warmups were about 29.9 s (360P) and 37.7 s (720P), excluded from measured duration.','',
'Generated FPS counts real decoded model output in complete four-frame batch log boundaries within the measured frame range; boundary precision is approximately one batch. Canvas FPS counts drawImage calls; presentation skips deliberately discard older queued images, never count as generated frames or server drops. Input ACK is client monotonic now minus the echoed client timestamp. Applied-control-to-draw uses that same client clock and matching frame seq; only controls represented in drawn frames qualify. No server/client clock subtraction.','',
'| Profile / recovery | Restore HTTP ms, cycles 1/2/3 | First new-epoch frame ms | First new-epoch canvas draw ms |',
'|---|---|---|---|']
for s in summaries:
    if not s['transitions']:continue
    vals=lambda field:'/'.join(f"{t[field]:.0f}" for t in s['transitions'])
    lines.append(f"| {s['profile']}P {s['mode']} | {vals('request_ms')} | {vals('first_frame_ms')} | {vals('first_draw_ms')} |")
lines+=['','A new-epoch WebSocket frame can arrive before the restore HTTP response; these timings intentionally measure both independently. The last valid canvas image is held during transition. New seed views visibly jump; they are not physically connected locations.','',
'Each recovery retained one session/world ID, advanced epochs by one, continued frame acknowledgments, and accepted resumed controls. Zero observed stale frames, frame gaps or duplicate-session creation within recovery. Explicit empty controls plus server reset clear old input; subsequent real frame batches record the changing trajectory. No black JPEG or stream disconnect was observed. Recovery tests use `/world/checkpoints/restore`; a new `/world/reset` regression, reconnect test, or Rescue/PPO benchmark is not claimed in this matrix.','',
'Median timings: 360P GPU inference ~27 ms, CPU JPEG encoding ~7.5 ms and transfer ~0.37 ms per four-frame batch. 720P inference ~107–111 ms, JPEG ~32 ms, transfer ~0.9 ms. Browser bitmap decode medians were ~1.2 ms and ~3.2 ms respectively. The 720P canvas rate of 8–9 FPS is not explained by bitmap decoding alone; full browser scheduling/draw/compositing profiling remains open. Both profiles reported visible documents. Do not confuse this experimental presenter with the earlier accepted React benchmark of 71.58 generated / 17.96 canvas FPS.','',
'## Visual findings — agent inspection, not an independent human rating','',
'- 360P no recovery: scene content collapses into repetitive wall/fence-like textures and an unrecognizable final view. Fails the visual criterion.','- 360P original and fresh: resets visibly recover clean seed content, but each 15-second segment drifts into fences, close walls and distorted vegetation. Fresh seeds do not make a 15-second budget reliably clean.','- 720P no recovery: higher detail initially; windows and architecture stretch and smear, followed by a wall/vegetation close-up with poor scene readability. More pixels do not remove autoregressive drift.','- 720P original: recognizable street/buildings recur after each restore, but the same starting view repeats and architectural ghosting returns.','- 720P fresh: the strongest tested variety and broad scene recognition; recognizable roads and houses recur without inheriting distorted frames. However, stretched windows, sloping surfaces and melted vegetation still occur. It does not establish continuously clean arbitrary exploration.','- Three clean-SDXL recoveries do not visibly carry the previous segment’s degraded image into the next seed. This is limited evidence for clean-seed recovery, not a guarantee against drift or a test of generated-checkpoint accumulation.','',
'Human review rubric: score 1 (unacceptable)–5 (convincing) for recognizable content, stable horizon/architecture, natural movement, camera responsiveness, smearing/blob severity (5 means absent), and restoration disruption (5 means unobtrusive). Review the full comparison video and native captures, especially pre-restore frames; do not judge only restored screenshots. User approval currently applies only to candidate 1. Independent human ratings of the walkthrough/videos are pending.','',
'## Semantic diagnostic','',
f"CPU-only CLIP ViT-B/32 revision `{semantic['revision']}`: load {semantic['load_seconds']:.2f} s, image inference p50 {semantic['cpu_inference_p50_ms']:.1f} ms / p95 {semantic['cpu_inference_p95_ms']:.1f} ms, CUDA allocated {semantic['cuda_allocated_bytes']} bytes. Occasional offline samples every ~5 s plus transition boundaries. No vision model ran during measured GPU sessions; concurrent CPU impact is not yet tested.",'',
'Approved SDXL structure cosine 0.294 versus human-rejected Waypoint 0.307; structure-minus-blob margins 0.0853 versus 0.0843. A simple structure threshold can accept a rejected image. Theme cosine differs (0.349 vs 0.296), but neither score proves quality or prompt fidelity. No automatic semantic threshold is calibrated or enabled. Sharpness/SSIM are likewise not proof of coherent architecture or persistent geometry.','',
'## Recommendation','',
'Preserve the accepted release and keep this experiment isolated. For a limited, honestly labeled guided visual demo, native 720P plus cached, reviewed, same-theme SDXL anchors is the best tested direction; manual Refresh is less surprising than an unexplained timed teleport. This matrix does not compare manual versus automatic user preference. Do not market it as a clear continuous 60-second world yet.','',
'Next experiment: use a conservative movement/generated-frame budget and smaller turns, with a shorter clean-seed recovery interval; measure whether reduced model-step exposure keeps architecture recognizable. Those settings are NOT verified by this matrix. Do not reuse degraded frames, activate obstacle/map APIs, or apply a blind CLIP approval gate. SDXL HIGH improves the start, not Waypoint’s long-term semantic guarantees.','',
'## Evidence and reproducibility','',
'`comparison/side-by-side-360-720.mp4`: 360P top row, 720P bottom; columns Fresh / None / Original. Real received JPEGs sampled at up to 5 Hz, timed to the recorded session; repeated sample holds, no interpolated/generated substitute frames. Video sampling FPS is not generated or canvas FPS. Individual clips and raw native JPG/PNG files are retained.','',
'`comparison/contact-sheet.jpg`: 0/15/30/45/60-second nearest samples. `comparison/transition-pairs.jpg` and `transition-index.json`: actual before/after each recovery. `comparison/summary.json`, `semantic-diagnostic.json`, per-run `report.json`, backend `results/<session_id>/batches.jsonl`: machine-readable measurements. `360-browser-completion.png`: browser completion proof.','',
'Isolated checkout: `C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\work\\native720-quality`, branch `experiment/prompt-grounded-recovery`; prior experiment parent `ad71609995c05199fe8951a74cc289b11dc0c4e7`. Production port 8000 and accepted release `642330461a6f67073bbabae43f83e8c3f0523145` preserved; frozen-file manifest matched with zero changes. Existing UI, RescueGame and AI Showdown not modified by this experiment.','',
'```powershell',
"Set-Location 'C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\work\\native720-quality'",
'# One experimental profile at a time; production 8000 remains untouched.',
'.\\experiments\\Start-RecoveryEvaluation.ps1 -Profile 720 -SwitchProfile',
'# Wait for http://127.0.0.1:8002/health ready; open',
'# http://127.0.0.1:4835/quality-recovery.html?profile=720',
'# Click Run three 60-second cases; keep visible until completion.',
'.\\experiments\\Start-RecoveryEvaluation.ps1 -Profile 360 -SwitchProfile',
'# Repeat with ?profile=360. Switch only after the previous world stops.',
"$taskPython='C:\\Users\\filma\\Documents\\Morph\\Codex Plus\\.venv\\Scripts\\python.exe'",
"& $taskPython experiments/analyze-clean-recovery.py --root 'C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\outputs\\recovery-evaluation' --backend experiments/backend --ffmpeg-python-path 'C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\work\\video-tools'",
"& $taskPython experiments/semantic-clean-check.py --root 'C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\outputs\\recovery-evaluation' --cache 'C:\\Users\\filma\\Documents\\Codex\\2026-10-10\\wo\\work\\clip-model' --gpu-tests-ended",
'& $taskPython experiments/write-clean-recovery-report.py','```','',
'Dependencies reuse the accepted GPU environment and installed transformers/Pillow/NumPy; FFmpeg is supplied through the cached imageio-ffmpeg helper. All model snapshots must already be cached (HF_HUB_OFFLINE=1). The test manifest uses local saved-scene paths. Do not run multiple GPU worlds. The bounded memory store permits eight world folders; archive past experimental evidence before a full rerun if this limit is reached.','',
'Validation: four memory/schema unit tests passed; JavaScript syntax, Python compilation and Git whitespace checks passed. Frontend build passed with the existing large-bundle warning (see timing caveat above). This is not a new full React regression.','']
(OUT/'VISUAL_BENCHMARK_REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
print(OUT/'VISUAL_BENCHMARK_REPORT.md')
