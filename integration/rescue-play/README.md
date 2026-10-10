# RescueGame handoff drop zone

Place the validated Grok package here:

```
integration/rescue-play/rescue_play.zip
```

After extract, Cloud expects (names may match the zip’s `INTEGRATION.md`):

- `INTEGRATION.md` — authoritative wiring instructions
- TypeScript RescueGame engine (exact rules, scoring, collisions, A*)
- Five playable missions + restart / win / loss / score / stars fixtures

**Do not** replace this with a rewritten browser simulator. The frontend will:

1. Unzip / vend the engine under `src/rescue-game/` (or the path `INTEGRATION.md` specifies)
2. Swap `src/services/rescueEnvAdapter.ts` to `source: 'grok-rescue-env'`
3. Keep `public/data/rescue/` showdown metrics and replays untouched

Until the zip lands, `/mission` continues to use the interim `browserRescueSim` behind the same adapter seam.
