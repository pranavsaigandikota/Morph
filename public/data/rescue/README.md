# Rescue Lab static data handoff

Drop exported evaluation artifacts into this folder (or replace it wholesale).

Required entrypoint: **`manifest.json`**

The frontend loads maps, trajectories, evaluations, and training history with `fetch()` only. No Grok simulator, PPO service, Python, or FastAPI is needed for Rescue Lab.

```
public/data/rescue/
  manifest.json
  maps/
  agents/
  trajectories/
  evaluations/
  training/
```

After copying a new package, refresh the browser — Vite serves `public/` as static files.
