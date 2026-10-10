# Native720 evidence review

No merge approval requested or granted. Archived release6423304 and backend are unchanged. This isolated branch adds opt-in browser diagnostics and a manual capture research overlay; it does not alter the presentation queue or introduce a rotation controller.

- [Accepted playback comparison](NATIVE720_PLAYBACK_COMPARISON.md): exact tested15644d9; scheduling invalidates a normal playback improvement claim.
- [Accepted Phase A0 report](PHASE_A0_TURN_GAIN_REPORT.md): three scenes,21 trials, NO-GO on automatic angle calibration.
- [Human scheduling procedure and manual capture workflow](HUMAN_BROWSER_DIAGNOSIS.md).
- [Automated minimal scheduling diagnosis](BROWSER_SCHEDULING_DIAGNOSIS.md): no-stream reproduction and actual Explorer; regular human-window results pending.
- [Playback summary](evidence/native720-playback-summary.json).
- [A0 measured manifest](evidence/a0/manifest.json) and [inferred analysis](evidence/a0/analysis.json).
- Contact sheets: [Florida](evidence/a0/scene-1-probe-sheet.jpg), [City](evidence/a0/scene-2-probe-sheet.jpg), [Underwater](evidence/a0/scene-3-probe-sheet.jpg).
- [Sampled side-by-side review clip](evidence/a0/a0-m32-sampled-review.mp4): one saved batch-last image per second, not real-time or full-frame-rate video.

Full raw JPEG/PNG captures and per-batch logs remain in Windows outputs, as specified in the reports. This GitHub packet includes reports, summaries and representative review evidence, not every raw capture. Local filesystem references in reports identify provenance, not cloud-accessible paths.

Serve from this branch with the existing experimental launcher; open `/scheduling-test.html` yourself in regular Brave. Actual React instrumentation only activates with `schedulingProbe=1`; manual survey only with `manualCapture=1`. The script does nothing on normal routes. After a30-second probe, timing wrappers are restored. No WebSocket code, control schema, credits, GPU inference code, checkpoint API or queue changes.

Manual captures use existing `/world/memory`, `/world/pause`, `/world/checkpoints/save`, `/world/checkpoints/{id}/review`, `/world/resume` and `/world/reset`. Original approval is explicit. The extra orientation/provenance annotations live only in an exported browser JSON manifest; no server API/schema extension. `angle_degrees:null`, relative user label and unscaled observed mouse totals are intentionally uncertain. Existing legacy navigation yaw remains labelled arbitrary, never treated as measured camera rotation. Human workflow validation is pending.
