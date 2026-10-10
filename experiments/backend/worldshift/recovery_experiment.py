"""Test-only composition. Clean cached SDXL references; NO obstacle/map API."""
import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
from .scene_service import app, combined_lifespan
from .service import ROOT
from .memory import Memory
from . import memory_service

class ReferenceMemory(Memory):
    async def begin(self,seed,request):
        await super().begin(seed,request)
        manifest=json.loads(Path(os.environ['WORLDSHIFT_EXPERIMENT_REFERENCES']).read_text())
        if request.prompt != manifest['original']['prompt']:
            raise ValueError('Experiment prompt must equal source theme exactly')
        for i,reference in enumerate(manifest['fresh']):
            if reference['prompt']!=request.prompt:raise ValueError('Reference theme mismatch')
            path=Path(reference['world_start_request']['seed_image_path'])
            raw=await asyncio.to_thread(path.read_bytes)
            cp=await self.save(f'Fresh SDXL reference {i+1}',raw,
                {'frame_id':None,'seq':-1,'epoch':self.s.epoch},dict(self.nav.state),'initial_seed')
            cp['source_kind']='fresh_sdxl_seed'
            cp['source_scene_id']=reference['scene_id']
            cp['source_seed']=reference['seed']
        # No generated checkpoint is preloaded: the human reviewer rejected it.

@asynccontextmanager
async def lifespan(app):
    async with combined_lifespan(app):
        root=ROOT/'native720_recovery';root.mkdir(exist_ok=True)
        app.state.service.visual_memory=ReferenceMemory(app.state.service,root)
        yield
        await app.state.service.visual_memory.finish()

app.router.lifespan_context=lifespan
