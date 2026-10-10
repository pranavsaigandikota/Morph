import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field
import json
import logging
import os
from pathlib import Path
import statistics
import time
import uuid

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .backend import Backend, MODEL, encode
from .protocol import Control, DisplayAck, SessionRequest, Start

ROOT = Path(__file__).resolve().parents[1]
log = logging.getLogger("worldshift")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def percentile(values, p):
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[round((len(ordered)-1)*p)]


@dataclass
class Subscriber:
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=8))
    outstanding: dict = field(default_factory=dict)
    dropped: int = 0
    acknowledged: int = 0
    last_ack: float = field(default_factory=time.perf_counter)

    def put(self, item):
        if self.queue.full():
            old = self.queue.get_nowait()
            if isinstance(old, tuple):
                self.outstanding.pop(old[0]["frame_id"], None)
                self.dropped += 1
        self.queue.put_nowait(item)

    def clear(self):
        while not self.queue.empty():
            old = self.queue.get_nowait()
            if isinstance(old, tuple):
                self.dropped += 1
        self.outstanding.clear()


class Service:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="worldshift-gpu")
        self.backend = None
        self.gpu_lock = asyncio.Lock()
        self.lifecycle_lock = asyncio.Lock()
        self.session = None
        self.status = "loading"
        self.error = None
        self.subscribers = {}
        self.controller = None
        self.keys = []
        self.mouse = [0.0, 0.0]
        self.seq = -1
        self.client_ts = None
        self.received_ms = 0
        self.last_control = 0
        self.epoch = 0
        self.frame_id = 0
        self.batch_id = 0
        self.task = None
        self.wake = asyncio.Event()
        self.samples = deque(maxlen=10000)
        self.generated = 0
        self.active_seconds = 0
        self.started = None
        self.ended = None
        self.memory = {}
        self.load_count = 0
        self.total_dropped = 0
        self.result_file = None
        self.visual_memory = None

    async def gpu(self, fn, *args):
        return await asyncio.get_running_loop().run_in_executor(self.executor, fn, *args)

    async def load(self):
        try:
            self.backend = await self.gpu(Backend)
            self.load_count += 1
            self.status = "ready"
            log.info("Loaded %s FP8 once in %.2fs", MODEL, self.backend.load_seconds)
        except Exception as exc:
            self.error = str(exc)
            self.status = "error"
            log.exception("GPU initialization failed")

    def find(self, sid):
        if not self.session or sid != self.session["id"]:
            raise HTTPException(404, "Unknown session")

    def clear_controls(self):
        self.keys, self.mouse = [], [0.0, 0.0]
        self.seq, self.client_ts, self.received_ms, self.last_control = -1, None, 0, 0

    def seed_path(self, req):
        if req.seed_image_path:
            path = Path(req.seed_image_path).expanduser().resolve()
        elif req.scene_id == "facility":
            path = ROOT / "assets" / "facility.jpg"
        else:
            raise HTTPException(422, "Unknown scene; supply seed_image_path")
        if not path.is_file() or path.stat().st_size > 25*2**20:
            raise HTTPException(422, "Seed must be a local image file no larger than 25 MiB")
        # Decode validation happens before claiming a starting session.
        from PIL import Image
        try:
            with Image.open(path) as image:
                if image.width*image.height > 40_000_000:
                    raise ValueError("Seed exceeds 40 megapixels")
                image.verify()
        except Exception as exc:
            raise HTTPException(422, f"Invalid seed image: {type(exc).__name__}") from exc
        return path

    async def start(self, req):
        async with self.lifecycle_lock:
            if self.status == "loading":
                raise HTTPException(503, "Model still loading")
            if self.backend is None or self.status == "error":
                raise HTTPException(503, self.error or "Model unavailable")
            if self.session is not None:
                raise HTTPException(409, "One GPU world supported; stop current session first")
            path = await asyncio.to_thread(self.seed_path, req)
            if self.visual_memory:
                self.visual_memory.preflight_start()
            sid = uuid.uuid4().hex
            self.session = {"id": sid, "request": req, "seed": path}
            self.status = "starting"
            self.error = None
            self.started = self.ended = None
            self.clear_controls()
            self.epoch += 1
            self.frame_id = self.batch_id = self.generated = self.total_dropped = 0
            self.active_seconds = 0
            self.samples.clear()
            if self.visual_memory:
                try:
                    await self.visual_memory.begin(path, req)
                except Exception:
                    self.session = None
                    self.status = "ready"
                    raise
            results = ROOT / "results" / sid
            results.mkdir(parents=True, exist_ok=True)
            self.result_file = (results / "batches.jsonl").open("w", encoding="utf-8")
            self.task = asyncio.create_task(self.run(), name="worldshift-generation")
            return {"session_id": sid, "status": "starting",
                    "prompt_conditioning": self.backend.prompt_supported,
                    "prompt_status": "applied" if self.backend.prompt_supported else "metadata_only"}

    async def run(self):
        try:
            async with self.gpu_lock:
                await self.gpu(self.backend.initialize, self.session["seed"], self.session["request"].prompt)
                self.memory = await self.gpu(self.backend.memory)
                self.status = "running"
            self.started = time.perf_counter()
            while self.session and self.status not in ("stopping", "error"):
                # No GPU generation without a connected consumer. Pause preserves history.
                if self.status != "running" or not self.subscribers:
                    self.wake.clear()
                    await self.wake.wait()
                    continue
                async with self.gpu_lock:
                    if self.status != "running":
                        continue
                    tick = time.perf_counter()
                    epoch = self.epoch
                    if tick - self.last_control > 0.5:
                        self.keys, self.mouse = [], [0.0, 0.0]
                    keys, mouse = list(self.keys), tuple(self.mouse)
                    self.mouse = [0.0, 0.0]
                    seq, timestamp = self.seq, self.client_ts
                    received = self.received_ms
                    frames, at, inference, transfer, memory = await self.gpu(self.backend.generate, keys, mouse)
                    jpeg, encoding_ms = await asyncio.to_thread(encode, frames)
                    self.memory = memory
                    batch_ms = (time.perf_counter()-tick)*1000
                    self.active_seconds += batch_ms/1000
                    self.generated += len(jpeg)
                    row = {"batch_id": self.batch_id, "epoch": epoch, "frames": len(jpeg),
                           "generated_at_ms": at, "inference_ms": inference, "transfer_ms": transfer,
                           "encoding_ms": encoding_ms, "batch_latency_ms": batch_ms,
                           "seq": seq, "client_timestamp_ms": timestamp, "keys": keys, "mouse": mouse,
                           "input_server_wait_ms": tick*1000-received if received else None,
                           "elapsed_seconds": time.perf_counter()-self.started, **memory}
                    self.samples.append(row)
                    self.batch_id += 1
                    self.result_file.write(json.dumps(row)+"\n")
                    self.result_file.flush()
                    for i, payload in enumerate(jpeg):
                        self.frame_id += 1
                        meta = {"type": "frame", "session_id": self.session["id"],
                                "frame_id": self.frame_id, "batch_id": row["batch_id"],
                                "batch_index": i, "batch_size": len(jpeg), "epoch": epoch,
                                "generated_at_ms": at, "inference_ms": inference,
                                "width": self.backend.width, "height": self.backend.height,
                                "encoding": "jpeg", "seq": seq, "client_timestamp_ms": timestamp,
                                "server_input_to_generated_ms": at-received if received else None}
                        for sub in self.subscribers.values():
                            # Eight frames of credit cap user-space AND socket backlog.
                            if len(sub.outstanding) >= 8:
                                sub.dropped += 1
                                continue
                            sub.outstanding[self.frame_id] = epoch
                            sub.put((meta, payload))
                    if self.visual_memory:
                        self.visual_memory.batch(jpeg[-1], meta, keys, mouse, len(jpeg))
                # A scheduler boundary lets controls/lifecycle requests run before the next batch.
                await asyncio.sleep(0)
        except Exception as exc:
            self.error = str(exc)
            self.status = "error"
            log.exception("Generation failed")
            for sub in self.subscribers.values():
                sub.put({"type": "error", "message": self.error})

    async def action(self, sid, action):
        if self.visual_memory and self.visual_memory.enhance_task and not self.visual_memory.enhance_task.done():
            raise HTTPException(409, "Enhancement active")
        async with self.lifecycle_lock:
            self.find(sid)
            async with self.gpu_lock:
                if self.status == "error" and action != "stop":
                    raise HTTPException(503, self.error)
                if action == "pause":
                    self.status = "paused"
                elif action == "resume":
                    self.status = "running"
                elif action == "reset":
                    paused = self.status == "paused"
                    try:
                        await self.gpu(self.backend.reinitialize, self.session["request"].prompt)
                    except Exception as exc:
                        self.status, self.error = "error", str(exc)
                        log.exception("Reset failed")
                        raise HTTPException(503, self.error) from exc
                    self.epoch += 1
                    self.status = "paused" if paused else "running"
                    if self.visual_memory:
                        self.visual_memory.reposition(self.visual_memory.world['checkpoints'][0])
                elif action == "stop":
                    self.status = "stopping"
                    self.ended = time.perf_counter()
                self.clear_controls()
                for sub in self.subscribers.values():
                    sub.clear()
                    sub.put({"type": "status", "status": self.status, "epoch": self.epoch})
                self.wake.set()
            if action == "stop":
                if self.task:
                    await self.task
                await self.gpu(self.backend.reset)
                if self.result_file:
                    self.result_file.close()
                    self.result_file = None
                self.session = None
                if self.visual_memory:
                    await self.visual_memory.finish()
                self.status = "ready"
                self.error = None
            return {"session_id": sid, "status": self.status, "epoch": self.epoch}

    def metrics(self):
        samples = list(self.samples)
        batches = [r["batch_latency_ms"] for r in samples]
        inference = [r["inference_ms"] for r in samples]
        elapsed = (self.ended or time.perf_counter())-self.started if self.started else 0
        return {"generated_fps": self.generated/elapsed if elapsed else 0,
                "active_generated_fps": self.generated/self.active_seconds if self.active_seconds else 0,
                "generated_frames": self.generated, "elapsed_seconds": elapsed,
                "batch_latency_ms": statistics.mean(batches) if batches else 0,
                "batch_latency_p50_ms": percentile(batches, .5), "batch_latency_p95_ms": percentile(batches, .95),
                "inference_p50_ms": percentile(inference, .5), "inference_p95_ms": percentile(inference, .95),
                "dropped_frames": self.total_dropped+sum(s.dropped for s in self.subscribers.values()),
                "acknowledged_frames_connected_clients": sum(s.acknowledged for s in self.subscribers.values()),
                "last_generated_at_ms": samples[-1]["generated_at_ms"] if samples else 0,
                "status": self.status, "model_load_count": self.load_count, **self.memory}


@asynccontextmanager
async def lifespan(app):
    service = Service()
    app.state.service = service
    load_task = asyncio.create_task(service.load())
    yield
    await load_task
    if service.session:
        await service.action(service.session["id"], "stop")
    service.backend = None
    service.executor.shutdown(wait=True)


app = FastAPI(title="WorldShift GPU inference", lifespan=lifespan)
origins = os.environ.get("WORLDSHIFT_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
async def health():
    s = app.state.service
    return {"status": s.status, "model_loaded": s.backend is not None, "error": s.error,
            "model": MODEL, "quant": "fp8w8a8", "model_load_count": s.load_count,
            "prompt_conditioning": s.backend.prompt_supported if s.backend else None}


@app.get("/world/metrics")
async def metrics():
    return app.state.service.metrics()


@app.post("/world/start")
async def start(req: Start):
    return await app.state.service.start(req)


def add_action(action):
    async def endpoint(req: SessionRequest):
        return await app.state.service.action(req.session_id, action)
    app.post(f"/world/{action}", name=action)(endpoint)


for name in ("reset", "stop", "pause", "resume"):
    add_action(name)


@app.websocket("/world/stream")
async def stream(ws: WebSocket, session_id: str):
    s = app.state.service
    origin = ws.headers.get("origin")
    if origin and origin not in origins:
        await ws.close(code=1008, reason="Origin is not allowed")
        return
    if not s.session or s.session["id"] != session_id or len(s.subscribers) >= 4:
        await ws.close(code=1008, reason="Unknown session or client limit reached")
        return
    await ws.accept()
    cid = uuid.uuid4().hex
    sub = Subscriber()
    s.subscribers[cid] = sub
    if s.controller is None:
        s.controller = cid
        s.clear_controls()
    sub.put({"type": "hello", "controller": s.controller == cid, "epoch": s.epoch,
             "encoding": "jpeg", "max_unacknowledged_frames": 8,
             "clock": "server perf_counter milliseconds; client timestamp echoed unchanged"})
    s.wake.set()

    async def sender():
        while True:
            item = await sub.queue.get()
            if isinstance(item, tuple):
                meta, payload = item
                if meta["epoch"] != s.epoch or not s.session or s.session["id"] != session_id:
                    sub.outstanding.pop(meta["frame_id"], None)
                    sub.dropped += 1
                    continue
                meta = {**meta, "sent_at_ms": time.perf_counter()*1000}
                await asyncio.wait_for(ws.send_json(meta), timeout=2)
                await asyncio.wait_for(ws.send_bytes(payload), timeout=2)
            else:
                await asyncio.wait_for(ws.send_json(item), timeout=2)
                if item.get("status") == "stopping":
                    return

    async def receiver():
        previous_timestamp = -1
        while True:
            raw = await ws.receive_text()
            if len(raw) > 4096:
                raise ValueError("Message exceeds 4096 characters")
            try:
                data = json.loads(raw)
                if data.get("type") == "control":
                    ctrl = Control.model_validate(data)
                    if s.controller != cid:
                        sub.put({"type": "error", "message": "Only the controller may submit input"})
                        continue
                    if ctrl.seq <= s.seq or ctrl.timestamp_ms < previous_timestamp:
                        sub.put({"type": "error", "message": "Control sequence/time must increase"})
                        continue
                    previous_timestamp = ctrl.timestamp_ms
                    s.keys = list(set(ctrl.keys))
                    s.mouse = [max(-1000, min(1000, a+b)) for a, b in zip(s.mouse, (ctrl.mouse_dx, ctrl.mouse_dy))]
                    s.seq, s.client_ts = ctrl.seq, ctrl.timestamp_ms
                    s.last_control = time.perf_counter()
                    s.received_ms = s.last_control*1000
                    sub.put({"type": "control_ack", "seq": ctrl.seq, "timestamp_ms": ctrl.timestamp_ms,
                             "server_received_at_ms": s.received_ms})
                elif data.get("type") == "display_ack":
                    ack = DisplayAck.model_validate(data)
                    if sub.outstanding.get(ack.frame_id) == ack.epoch and ack.epoch == s.epoch:
                        # Exact per-frame ack: it also releases credit for frames intentionally skipped by client.
                        sub.acknowledged += 1
                        sub.outstanding.pop(ack.frame_id)
                        sub.last_ack = time.perf_counter()
                else:
                    sub.put({"type": "error", "message": "Unknown message type"})
            except (ValidationError, json.JSONDecodeError, AttributeError) as exc:
                sub.put({"type": "error", "message": "Invalid control/ack schema", "detail": type(exc).__name__})

    tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (WebSocketDisconnect, asyncio.TimeoutError, TimeoutError, RuntimeError, ValueError):
        log.info("Stream closed: %s", cid)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        s.total_dropped += sub.dropped + len(sub.outstanding)
        s.subscribers.pop(cid, None)
        if s.controller == cid:
            s.clear_controls()
            s.controller = next(iter(s.subscribers), None)
            if s.controller:
                s.subscribers[s.controller].put({"type": "controller", "controller": True})
        with suppress(RuntimeError, WebSocketDisconnect):
            await ws.close()
