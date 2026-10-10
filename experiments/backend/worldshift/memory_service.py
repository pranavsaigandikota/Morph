"""Isolated memory composition. Production port8000 is never imported or edited."""
from contextlib import asynccontextmanager
from typing import Literal
from fastapi.responses import FileResponse
from pydantic import Field
from .scene_service import app, combined_lifespan
from .service import ROOT
from .protocol import Strict
from .memory import Memory

@asynccontextmanager
async def lifespan(app):
    async with combined_lifespan(app):
        app.state.service.visual_memory = Memory(app.state.service, ROOT)
        yield
        await app.state.service.visual_memory.finish()

app.router.lifespan_context = lifespan

class Save(Strict):
    session_id: str
    label: str = Field(default='Manual checkpoint', max_length=100)
class Review(Strict):
    session_id: str
    approved: bool
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
    return await memory(req.session_id).save(req.label)

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
    return await memory(req.session_id).review(checkpoint_id,req.approved)
