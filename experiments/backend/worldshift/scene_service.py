"""Optional API composition; imports the preserved inference service unchanged."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
import secrets
import time
import uuid

from fastapi import HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import Field, field_validator
from typing import Literal

from .service import app, lifespan as waypoint_lifespan, ROOT
from .protocol import Strict
from .scenes_backend import SceneBackend, MODEL, REVISION

log = logging.getLogger("worldshift.scenes")
STORE = ROOT / "saved_scenes"


class GenerateScene(Strict):
    prompt: str = Field(min_length=1, max_length=500)
    seed: int | None = Field(default=None, ge=0, le=2**32-1, strict=True)
    steps: int = Field(default=30, ge=1, le=50, strict=True)
    perspective: Literal["first_person"] = "first_person"
    style: str | None = Field(default=None, min_length=1, max_length=80)
    quality: Literal['high'] = 'high'
    # Optional explicit size from the HQ contact-sheet client. Native 1280x720 is the only supported target.
    width: Literal[1280] = 1280
    height: Literal[720] = 720

    @field_validator("prompt", "style")
    @classmethod
    def prompt_valid(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value or not value.isprintable():
            raise ValueError("Prompt must be printable nonempty text")
        if re.search(r"third[ -]?person|over[ -]the[ -]shoulder|selfie|aerial view|bird.s.eye", value, re.I):
            raise ValueError("Only first-person scenes are supported")
        return value


def write_json(path, obj):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(obj, indent=2), encoding="utf-8")
    temporary.replace(path)


class Scenes:
    def __init__(self, service):
        self.service = service
        self.backend = None
        self.busy = None
        self.task = None
        self.loop = asyncio.get_running_loop()
        STORE.mkdir(exist_ok=True)
        # Persist failure rather than reporting a stale running job after a crash.
        for path in STORE.glob("*/job.json"):
            job = json.loads(path.read_text())
            if job["status"] in ("queued", "running"):
                job.update(status="error", phase="interrupted", error="Server stopped during generation; submit a new job")
                write_json(path, job)

    def progress(self, job, phase, step, total):
        def update():
            job.update(phase=phase, step=step, total_steps=total, updated_at=datetime.now(timezone.utc).isoformat())
            write_json(STORE / job["job_id"] / "job.json", job)
        self.loop.call_soon_threadsafe(update)

    async def submit(self, req):
        s = self.service
        if self.busy:
            raise HTTPException(409, {"message": "Scene generation already active", "job_id": self.busy})
        if s.status != "ready" or s.session or s.lifecycle_lock.locked():
            raise HTTPException(409, "Stop the active world and wait for health ready before generating a scene")
        # Reserve existing lifecycle lock before returning 202: no GPU/start race.
        await s.lifecycle_lock.acquire()
        job_id = uuid.uuid4().hex
        folder = STORE / job_id
        try:
            folder.mkdir()
            job = {"job_id": job_id, "scene_id": None, "status": "queued", "phase": "waiting_for_gpu",
                   "prompt": req.prompt, "seed": req.seed if req.seed is not None else secrets.randbits(32),
                   "steps": req.steps, "style": req.style, "perspective": "first_person", "step": 0, "total_steps": req.steps,
                   "created_at": datetime.now(timezone.utc).isoformat(), "error": None}
            write_json(folder / "job.json", job)
            self.busy = job_id
            self.task = asyncio.create_task(self.run(job), name="worldshift-scene")
            return {"job_id": job_id, "status": "queued", "poll_url": f"/scenes/jobs/{job_id}"}
        except Exception:
            s.lifecycle_lock.release()
            raise

    async def run(self, job):
        s = self.service
        folder = STORE / job["job_id"]
        started = time.perf_counter()
        job["status"] = "running"
        write_json(folder / "job.json", job)
        progress = lambda phase, step, total: self.progress(job, phase, step, total)
        try:
            async with s.gpu_lock:
                if self.backend is None:
                    self.backend = await s.gpu(SceneBackend, progress)
                image, effective, memory = await s.gpu(self.backend.generate, job["prompt"], job["seed"], job["steps"], progress, job["style"])
                progress("saving", job["steps"], job["steps"])
                image_path = folder / "seed.png"
                await asyncio.to_thread(image.save, image_path)
                metadata = {"scene_id": job["job_id"], "kind": "generated", "prompt": job["prompt"],
                    "effective_prompt": effective, "style": job["style"], "seed": job["seed"], "perspective": "first_person",
                    "model": MODEL, "revision": REVISION, "steps": job["steps"], "guidance_scale": 5.0,
                    "model_width": 1280, "model_height": 720, "width": 1280, "height": 720,
                    "created_at": job["created_at"], "image_sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
                    "total_seconds": time.perf_counter()-started, **memory,
                    "image_url": f"/scenes/{job['job_id']}/image",
                    "world_start_request": {"scene_id": job["job_id"], "seed_image_path": str(image_path.resolve()), "prompt": job["prompt"]}}
                write_json(folder / "scene.json", metadata)
                s.memory = await s.gpu(s.backend.memory)
                job.update(status="ready", phase="ready", scene_id=job["job_id"], metadata=metadata)
                log.info("Scene %s saved in %.2fs, Waypoint load count %d", job["job_id"], metadata["total_seconds"], s.load_count)
        except Exception as exc:
            job.update(status="error", phase="error", error=f"{type(exc).__name__}: {exc}")
            log.exception("Scene generation failed; Waypoint remains separate")
        finally:
            write_json(folder / "job.json", job)
            self.busy = None
            s.lifecycle_lock.release()


@asynccontextmanager
async def combined_lifespan(app):
    async with waypoint_lifespan(app):
        manager = Scenes(app.state.service)
        app.state.scenes = manager
        yield
        if manager.task:
            await manager.task
        if manager.backend:
            await app.state.service.gpu(manager.backend.close)
            manager.backend = None


app.router.lifespan_context = combined_lifespan


@app.middleware("http")
async def generation_guard(request, call_next):
    manager = getattr(app.state, "scenes", None)
    if manager and manager.busy and request.method == "POST" and request.url.path == "/world/start":
        response = JSONResponse(status_code=409, content={"detail": {"message": "Wait for scene generation to finish", "job_id": manager.busy}})
        # This outer middleware returns before the inherited CORS middleware.
        from .service import origins
        origin = request.headers.get("origin")
        if origin in origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response
    return await call_next(request)


@app.post("/scenes/generate", status_code=202)
async def generate(req: GenerateScene):
    return await app.state.scenes.submit(req)


def scene_folder(scene_id):
    if not re.fullmatch(r"[0-9a-f]{32}", scene_id):
        raise HTTPException(404, "Unknown scene/job")
    return STORE / scene_id


@app.get("/scenes/jobs/{job_id}")
async def job(job_id: str):
    path = scene_folder(job_id) / "job.json"
    if not path.is_file():
        raise HTTPException(404, "Unknown job")
    return json.loads(path.read_text())


def predefined():
    return {"scene_id": "facility", "kind": "predefined", "perspective": "first_person", "prompt": "First-person industrial research facility",
            "image_url": "/scenes/facility/image", "world_start_request": {"scene_id": "facility", "seed_image_path": None, "prompt": "First-person industrial research facility"}}


@app.get("/scenes")
async def list_scenes(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    paths = sorted(STORE.glob("*/scene.json"), key=lambda p: p.parent.name)
    entries = [predefined()] + [json.loads(p.read_text()) for p in paths]
    return {"scenes": entries[offset:offset+limit], "total": len(entries), "limit": limit, "offset": offset}


@app.get("/scenes/{scene_id}/image")
async def scene_image(scene_id: str):
    path = ROOT / "assets" / "facility.jpg" if scene_id == "facility" else scene_folder(scene_id) / "seed.png"
    if not path.is_file():
        raise HTTPException(404, "Scene image unavailable")
    return FileResponse(path, media_type="image/jpeg" if scene_id == "facility" else "image/png")


@app.get("/scenes/{scene_id}")
async def scene(scene_id: str):
    if scene_id == "facility":
        return predefined()
    path = scene_folder(scene_id) / "scene.json"
    if not path.is_file():
        raise HTTPException(404, "Scene not ready or unknown")
    return json.loads(path.read_text())
