# Human-operated browser scheduling diagnosis

Status: prepared for a regular, manually operated Brave window. Automated measurements are a separate condition and do not prove regular-window performance. Root cause remains unestablished until the human results are available.

## Exact procedure

The isolated server is currently running at port4835. In a **new normal Brave window that you open yourself**, paste `http://127.0.0.1:4835/scheduling-test.html` into the address bar. Do not use the agent's existing controlled tab for the human comparison. Keep the tested page fully visible, unminimized and unobscured for each 30-second run. Close DevTools during measurement. Do not switch tabs or open downloads until the run completes.

1. Select **rAF only**, click **Measure 30 seconds**, wait until the button re-enables, then **Download result JSON**.
2. Select **JPEG decode only**, repeat and download. This uses a cached genuine native720 JPEG, no streaming and no drawing.
3. Select **Predecoded canvas drawing only**, repeat and download. It decodes once before measurement, then times drawImage separately. Browser decode and draw scheduling are separate measurements.
4. Stop any other live WorldShift world first; leave the archived service paused. Click **Open instrumented Explorer**. This uses the actual React Explorer, existing native720 API and current unchanged frame queue. Connect using its normal controls and confirm **LIVE**, not MOCK. Wait for actual video, then click **Measure Explorer 30 seconds** in the diagnostic overlay. Move/look naturally, keep the page visible, and download timing JSON after completion. Stop the world afterward.
5. Repeat rAF-only after the Explorer test to detect changing browser conditions. Keep browser version, monitor and Windows power mode the same between runs. Record monitor refresh rate, Brave version, whether plugged into power, and any battery/energy/memory-saving settings.

For power-saving checks, inspect Brave settings yourself: search for `energy`, `battery`, `memory` or `performance` and record which settings actually exist in your installed version and their state. Also record graphics acceleration and Windows power mode. The page cannot reliably read these settings; it reports this explicitly. Do not change settings in the first run. If a later controlled repeat changes one setting, record exactly which setting changed. No settings were changed by this experiment.

If the service is stopped, from PowerShell:

```powershell
Set-Location 'C:\Users\filma\Documents\Codex\2026-10-10\wo\work\native720-quality'
powershell -ExecutionPolicy Bypass -File .\experiments\Start-RecoveryEvaluation.ps1
```

The launcher refuses to overwrite an occupied port. Use `-Restart` only when the owned experimental8002 service is idle/ready and restarting it is intended. It never restarts the archived backend. The experimental service currently restricts world starts to its approved Florida reference theme; the supplied Explorer link uses that saved seed. No 360p fallback is exposed.

## Interpretation

Compare automated versus human-operated rAF first. Callback rate generally follows the display's scheduling rather than a universal 60FPS target. About one callback per second in rAF-only means Waypoint, JPEG transport and the Explorer queue are not required to reproduce the scheduling limitation. It does not by itself identify the exact browser/automation/power-saving cause.

If regular rAF-only is normal but actual Explorer rAF is low, examine long tasks and image timings. If Explorer rAF is normal but canvas FPS is low, examine received FPS, presentation skips and queue/decode behavior before changing the presenter. If automated rAF is low but regular human-operated rAF is normal, automation conditions are implicated; keep those results separate.

JSON includes callback intervals, visibility/focus samples, long tasks, decode and draw percentiles. Explorer includes counter differences for received/canvas FPS, presentation skips, decode/protocol errors, session/epoch continuity and a server metrics snapshot. Absolute clocks are never subtracted. Do not compare a run across session/epoch changes as if it were continuous playback.

drawImage duration measures JavaScript submission, not GPU compositor completion. Explorer src-to-load latency includes dispatch/loading and decoding, rather than pure decoder CPU time. Its opt-in wrappers are removed after measurement. The standalone decode mode uses createImageBitmap; Explorer currently uses HTMLImageElement, so those pathways must not be conflated.

## Manual look-and-capture research prototype

The Explorer link also enables `manualCapture=1`. No automatic rotation and no exact degree headings.

1. **Review original seed**, then explicitly approve the displayed raw seed.
2. Look naturally using existing controls. Release WASD/mouse movement before capture.
3. Enter a relative label such as `left doorway` or `road ahead`; click **Save / review view**. The existing session is paused while the backend stores its latest genuine raw frame.
4. Inspect the actual stored checkpoint preview; **Accept recognizable view** or **Reject view**. Exploration resumes after review. Reject distorted images.
5. Repeat for any useful views. **Finish: restore original seed** calls the existing POST /world/reset using the same session. Epoch advances, existing input clearing/queue handling applies. Resume with the normal UI if the session was paused.
6. **Export capture manifest** records raw checkpoint metadata/hash, checkpoint/world/session/epoch/frame/control-sequence identity, human review and relative label. Orientation degrees remain null. DOM mouse totals are unscaled observations that can include off-canvas movement; uncertainty is unbounded. Legacy navigation yaw in server metadata is an arbitrary estimate, not calibrated pose.

The stored server frame can be newer than the displayed view when Save is clicked. Its returned frame ID/hash is authoritative; the preview is what the human reviews. The request's last received frame ID is recorded separately and is never described as the captured displayed frame. Raw images remain on the backend. No enhanced image, map or obstacle analysis is enabled.

Session changes require reloading the survey panel. Capture and reset buttons are guarded against concurrent actions. API failures are shown, never replaced by mock content. Existing backend periodic checkpoints remain candidates; they are not silently considered human-approved survey views. This optional overlay prototype still needs a full human workflow validation; build/syntax checks alone do not validate it.

## Isolation and review

No backend, WebSocket credits, production queue, RescueGame, AI Showdown or frozen release changes. Diagnostic overlay exists only with the explicit query parameters; normal routes execute no instrumentation. GitHub review branch will contain the two accepted evidence reports and companion summaries/contact sheets. Complete raw Windows captures remain in the local outputs folder.
