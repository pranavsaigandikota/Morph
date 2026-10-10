"""Isolated memory composition. Production port8000 is never imported or edited."""
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import Query
from fastapi.responses import FileResponse
from pydantic import Field, model_validator
from .scene_service import app, combined_lifespan
from .service import ROOT
from .protocol import Strict
from .memory import Memory

async def prewarm_sdxl(app):
    """Load SDXL weights (CPU RAM, offload hooks) once Waypoint is ready, so the first anchor capture is fast."""
    import asyncio, logging
    from .scenes_backend import SceneBackend
    s=app.state.service
    while s.backend is None and s.status!='error':
        await asyncio.sleep(1)
    if s.status=='error':return
    try:
        async with s.gpu_lock:
            if app.state.scenes.backend is None:
                app.state.scenes.backend=await s.gpu(SceneBackend,lambda *a:None)
        logging.getLogger('worldshift').info('SDXL prewarmed for anchor enhancement')
    except Exception:
        logging.getLogger('worldshift').exception('SDXL prewarm failed; enhancement will load on demand')

@asynccontextmanager
async def lifespan(app):
    import asyncio, os
    async with combined_lifespan(app):
        app.state.service.visual_memory = Memory(app.state.service, ROOT)
        app.state.service.visual_memory.scenes = app.state.scenes
        warm = asyncio.create_task(prewarm_sdxl(app)) if os.environ.get('WORLDSHIFT_PREWARM_SDXL','0')=='1' else None
        yield
        if warm: await warm
        await app.state.service.visual_memory.finish()

app.router.lifespan_context = lifespan

SoftLabel = Literal['forward','forward_right','right','behind_right','behind','behind_left','left','forward_left','unlabeled']
class Calibration(Strict):
    """Guided manual calibration tag. soft_label is a player tag, never a commanded or measured angle."""
    calibration_id: str = Field(pattern=r'^[a-z0-9]{6,32}$')
    kind: Literal['capture','return_check'] = 'capture'
    soft_label: SoftLabel = 'unlabeled'
class Save(Strict):
    session_id: str
    label: str = Field(default='Manual checkpoint', max_length=100)
    capture_reason: Literal['manual','calibration'] = 'manual'
    calibration: Calibration | None = None
    @model_validator(mode='after')
    def calibration_matches_reason(self):
        if (self.capture_reason=='calibration')!=(self.calibration is not None):
            raise ValueError("calibration is required exactly when capture_reason is 'calibration'")
        return self
class Review(Strict):
    session_id: str
    approved: bool
    reviewer: str | None = Field(default=None, max_length=64)
    reason: str | None = Field(default=None, max_length=200)
class AnchorCapture(Strict):
    session_id: str
    label: str = Field(default='Clear view', max_length=100)
    enhance: bool = True
    strength: float = Field(default=0.35, ge=0.1, le=0.6)
    restore_here: bool = False
class Restore(Strict):
    session_id: str
    checkpoint_id: str
    variant: Literal['raw', 'enhanced'] = 'raw'
    accept_unreviewed: bool = False

def memory(sid):
    m=app.state.service.visual_memory
    m.find(sid)
    return m

@app.get('/world/memory')
async def snapshot(session_id: str):
    return memory(session_id).snapshot()

@app.get('/world/checkpoints')
async def checkpoints(session_id: str):
    w=memory(session_id).world
    return {k:w[k] for k in ('world_id','session_id','checkpoints')}

@app.post('/world/checkpoints/save')
async def save(req: Save):
    cal=req.calibration.model_dump() if req.calibration else None
    return await memory(req.session_id).save(req.label,capture_reason=req.capture_reason,calibration=cal)

@app.post('/world/anchors/capture')
async def capture_anchor(req: AnchorCapture):
    return await memory(req.session_id).capture_anchor(req.session_id,req.label,req.enhance,req.strength,req.restore_here)

@app.get('/world/navigation')
async def navigation(session_id: str, trajectory_since: int = Query(default=0, ge=0)):
    return memory(session_id).navigation_since(trajectory_since)

@app.post('/world/checkpoints/restore')
async def restore(req: Restore):
    return await memory(req.session_id).restore(req)

@app.get('/world/recovery')
async def recovery(session_id: str):
    return memory(session_id).recovery

@app.get('/world/checkpoints/{checkpoint_id}')
async def checkpoint(checkpoint_id: str, session_id: str):
    return memory(session_id).checkpoint(checkpoint_id)

@app.get('/world/checkpoints/{checkpoint_id}/image')
async def image(checkpoint_id: str, session_id: str, variant: Literal['raw','enhanced']='raw'):
    path=memory(session_id).image(checkpoint_id,variant)
    from PIL import Image
    with Image.open(path) as img: mime=Image.MIME[img.format]
    return FileResponse(path,media_type=mime,headers={'Cache-Control':'no-store'})

@app.post('/world/checkpoints/{checkpoint_id}/review')
async def review(checkpoint_id: str, req: Review):
    return await memory(req.session_id).review(checkpoint_id,req.approved,req.reviewer,req.reason)
