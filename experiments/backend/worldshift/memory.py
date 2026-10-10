"""Bounded visual evidence and applied-control dead reckoning. No geometry claim."""
import asyncio
from collections import deque
from datetime import datetime, timezone
import io
import hashlib
import json
import math
import os
from pathlib import Path
import time
import uuid
from fastapi import HTTPException
import numpy as np
from PIL import Image

def now():
    return datetime.now(timezone.utc).isoformat()

def inspect_image(data):
    with Image.open(io.BytesIO(data)) as im:
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        gray=np.asarray(im.convert('L').resize((160,90)),dtype=np.float32)
    variance=float(gray.std())
    sharpness=float(np.var(gray[1:-1,2:]+gray[1:-1,:-2]+gray[2:,1:-1]+gray[:-2,1:-1]-4*gray[1:-1,1:-1]))
    return {'status':'invalid_uniform' if variance<3 else 'candidate_unreviewed','reviewed':False,'approved':False,'indicators':{'luma_std':variance,'laplacian_variance':sharpness}}

def write_json(path,value):
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(value,indent=2),encoding='utf-8')
    temp.replace(path)

# Heading model v2 (ESTIMATED). Fitted on experiment/held-look-ijkl: 1801 steady held batches, 3 scenes,
# image pan per batch ~= 0.27*|mouse|^0.49 px at 160 px width (sub-linear). Pan is converted to radians with an
# ASSUMED 90 degree horizontal field of view; no FOV has been measured, so headings are estimates, not angles.
# The v1 linear 0.002 rad/unit over-rotated the map ~6x versus the visible turn.
PAN_PX_GAIN=.2697
PAN_EXPONENT=.494
ASSUMED_HFOV_RAD=math.pi/2
YAW_GAIN=PAN_PX_GAIN/160*ASSUMED_HFOV_RAD
UNITS_PER_SECOND=1.
NOMINAL_FPS=60
SPRINT_FACTOR=1.35  # Shift; INFERRED: sprint showed ~1.35x per-batch image change vs walk (Florida, 2 repeats each)
NAV_MODEL={'version':2,'yaw_model':'power','yaw_gain_rad':YAW_GAIN,'yaw_exponent':PAN_EXPONENT,'assumed_hfov_deg':90,'units_per_second':UNITS_PER_SECOND,'nominal_fps':NOMINAL_FPS,'sprint_factor':SPRINT_FACTOR,'source':'held_look_fit_assumed_hfov','turn_gain':'estimated_from_image_pan','fit_report':'experiment/held-look-ijkl:experiments/held-look/HELD_LOOK_REPORT.md','a0_report':'experiment/native720-turn-gain-a0@d7c7435:experiments/a0/PHASE_A0_TURN_GAIN_REPORT.md'}
CAPTURE_REASONS=('initial_seed','manual','periodic','calibration','anchor')
# Raised for player-captured clear-view anchors (raw + enhanced PNG each).
MAX_CHECKPOINTS=int(os.getenv('WORLDSHIFT_MAX_CHECKPOINTS','128'))
DISK_BUDGET=int(os.getenv('WORLDSHIFT_MEMORY_DISK_MB','2048'))*1024**2
MAX_WORLDS=int(os.getenv('WORLDSHIFT_MAX_WORLDS','64'))

def look_delta(units):
    """Estimated radians for one batch's accumulated mouse units (sign preserved)."""
    return math.copysign(YAW_GAIN*abs(units)**PAN_EXPONENT,units) if units else 0.

class Navigation:
    def __init__(self,epoch):
        self.state={'x':0.,'z':0.,'yaw':0.,'pitch':0.,'units':'estimated_units','confidence':1.,'cumulative_movement':0.,'segment_id':uuid.uuid4().hex,'relationship':'new_unknown','control_seq':-1,'epoch':epoch,'server_elapsed_ms':0.,'anchor_kind':'world_start','restored_from_checkpoint_id':None}
    def apply(self,keys,mouse,seq,epoch,at,frames=4):
        s=self.state
        dx,dy=mouse
        s['yaw']=(s['yaw']+look_delta(dx)+math.pi)%(2*math.pi)-math.pi
        # Pitch uses the same fitted response; vertical look was not separately measured. Positive dy = look down.
        s['pitch']=max(-math.pi/2,min(math.pi/2,s['pitch']+look_delta(dy)))
        forward=int('w' in keys)-int('s' in keys)
        strafe=int('d' in keys)-int('a' in keys)
        norm=math.hypot(forward,strafe)
        if norm:
            dt=frames/NOMINAL_FPS*UNITS_PER_SECOND*(SPRINT_FACTOR if 'shift' in keys else 1.)
            s['x']+=(forward*math.sin(s['yaw'])+strafe*math.cos(s['yaw']))/norm*dt
            s['z']+=(forward*math.cos(s['yaw'])-strafe*math.sin(s['yaw']))/norm*dt
            s['cumulative_movement']+=dt
        s['confidence']=max(.05,s['confidence']-norm*.0005-(abs(dx)+abs(dy))*.0001)
        s.update(control_seq=seq,epoch=epoch,server_elapsed_ms=at,relationship='estimated_continuous' if norm or dx or dy else s['relationship'])
        return dict(s)

class Memory:
    def __init__(self,service,root):
        self.s=service;self.root=root/'world_memory';self.root.mkdir(exist_ok=True)
        self.world=None;self.latest=None;self.nav=None;self.trajectory=deque(maxlen=2048)
        self.interval=max(5,min(120,float(os.getenv('WORLDSHIFT_CHECKPOINT_SECONDS','10'))))
        # navigation_update event rate only; trajectory sampling stays at 1 Hz so 2048 points still span ~34 min.
        self.event_period=1/max(1.,min(5.,float(os.getenv('WORLDSHIFT_NAV_EVENT_HZ','1'))))
        self.trajectory_total=0;self.last_traj=0.
        self.last_save=0.;self.last_event=0.;self.last_turn=0.;self.event_seq=0
        self.lock=asyncio.Lock();self.capture_task=None;self.jobs={};self.enhance_task=None
        self.recovery={'status':'idle','error':None}
        self.scenes=None;self.anchor_busy=False
    def find(self,sid):
        self.s.find(sid)
        if not self.world or self.world['session_id']!=sid:
            raise HTTPException(404,'Unknown memory session')
        return self.world
    def emit(self,kind,payload):
        if not self.world:return
        self.event_seq+=1
        event={'type':kind,'world_id':self.world['world_id'],'session_id':self.world['session_id'],'epoch':self.s.epoch,'event_seq':self.event_seq,'server_elapsed_ms':time.perf_counter()*1000,'payload':payload}
        for sub in self.s.subscribers.values():
            # Never evict a JPEG/credit just to send optional memory telemetry.
            if sub.queue.qsize()<6:sub.queue.put_nowait(event)
    def preflight_start(self):
        if len(list(self.root.glob('*/world.json')))>=MAX_WORLDS:
            raise HTTPException(507,'Memory world-folder quota reached; archive old experiment evidence before starting')
    async def finish(self):
        if self.capture_task:await self.capture_task
        self.latest=None
    async def begin(self,seed,request):
        self.preflight_start()
        sid=self.s.session['id'];wid=uuid.uuid4().hex
        self.world={'world_id':wid,'session_id':sid,'prompt':request.prompt,'created_at':now(),'checkpoints':[]}
        metadata_path=seed.parent/'scene.json'
        if metadata_path.is_file():
            metadata=json.loads(await asyncio.to_thread(metadata_path.read_text))
            self.world['scene_context']={k:metadata.get(k) for k in ('scene_id','prompt','style','seed','effective_prompt','model','revision','image_sha256')}
        else:
            self.world['scene_context']={'prompt':request.prompt,'style':None,'seed':None}
        self.nav=Navigation(self.s.epoch);self.latest=None;self.trajectory.clear();self.trajectory_total=0;self.event_seq=0
        self.last_save=time.perf_counter();self.last_event=0.;self.last_traj=0.;self.last_turn=0.;self.recovery={'status':'idle','error':None}
        folder=self.root/wid;folder.mkdir()
        raw=await asyncio.to_thread(seed.read_bytes)
        await self.save('Initial seed',raw,{'frame_id':None,'seq':-1,'epoch':self.s.epoch},dict(self.nav.state),'initial_seed',capture_reason='initial_seed')
    def append_trajectory(self,pose):
        self.trajectory.append(pose);self.trajectory_total+=1
    def batch(self,jpeg,meta,keys,mouse,frames):
        if not self.world:return
        pose=self.nav.apply(keys,mouse,meta['seq'],meta['epoch'],meta['generated_at_ms'],frames)
        self.latest=(jpeg,dict(meta),pose)
        tick=time.perf_counter()
        if tick-self.last_traj>=1:
            self.last_traj=tick;self.append_trajectory(pose)
        if tick-self.last_event>=self.event_period:
            self.last_event=tick
            self.emit('navigation_update',{'navigation':pose})
        turn=abs((pose['yaw']-self.last_turn+math.pi)%(2*math.pi)-math.pi)
        if (tick-self.last_save>=self.interval or (turn>.7 and tick-self.last_save>=5)) and not (self.capture_task and not self.capture_task.done()):
            self.last_save=tick;self.last_turn=pose['yaw']
            expected=self.world['world_id']
            self.capture_task=asyncio.create_task(self.capture(expected),name='memory-candidate')
    async def capture(self,expected):
        try:
            if self.world and self.world['world_id']==expected:await self.save('Periodic candidate',capture_reason='periodic')
        except Exception as exc:
            self.emit('checkpoint_updated',{'status':'capture_rejected','error':str(exc)})
    async def save(self,label,raw=None,meta=None,pose=None,provenance='raw_video_frame',capture_reason='manual',calibration=None):
        if capture_reason not in CAPTURE_REASONS:raise ValueError(capture_reason)
        async with self.lock:
            if raw is None:
                if not self.latest:raise HTTPException(409,'No generated frame available')
                raw,meta,pose=self.latest
            world=self.world
            if len(world['checkpoints'])>=MAX_CHECKPOINTS:raise HTTPException(507,f'Checkpoint quota {MAX_CHECKPOINTS} reached')
            folder=self.root/world['world_id']
            total=sum(p.stat().st_size for p in self.root.glob('*/*') if p.is_file())
            if total+len(raw)>DISK_BUDGET:raise HTTPException(507,'Memory disk budget reached')
            quality=await asyncio.to_thread(inspect_image,raw)
            if quality['status']=='invalid_uniform':raise HTTPException(422,{'message':'Image rejected','quality':quality})
            if self.world is not world:raise HTTPException(409,'World changed during capture')
            cid=uuid.uuid4().hex;file=folder/(cid+'.raw')
            await asyncio.to_thread(file.write_bytes,raw)
            cp={'checkpoint_id':cid,'world_id':world['world_id'],'session_id':world['session_id'],'epoch':meta['epoch'],'prompt':world['prompt'],'frame_id':meta['frame_id'],'control_seq':meta['seq'],'created_at':now(),'provenance':provenance,'label':label,'navigation':dict(pose),'quality':quality,'image_url':f"/world/checkpoints/{cid}/image?session_id={world['session_id']}&variant=raw",'enhanced_image_url':None,'enhancement_status':'none'}
            world['checkpoints'].append(cp)
            cp['image_sha256']=hashlib.sha256(raw).hexdigest()
            cp['actions_history_reference']={'session_id':world['session_id'],'control_seq':meta['seq'],'epoch':meta['epoch'],'frame_id':meta['frame_id']}
            # Calibration soft labels are player tags, never commanded or measured angles. Calibration
            # acceptance is client-side; it does not touch quality.approved (recovery-anchor approval).
            cp['capture_reason']=capture_reason;cp['calibration']=dict(calibration) if calibration else None
            cp['review']={'reviewed_at':None,'reviewer':None,'reason':None}
            await asyncio.to_thread(write_json,folder/'world.json',world)
            self.emit('checkpoint_saved',{'checkpoint':cp})
            return cp
    def checkpoint(self,cid):
        cp=next((c for c in self.world['checkpoints'] if c['checkpoint_id']==cid),None)
        if not cp:raise HTTPException(404,'Checkpoint not in current world')
        return cp
    def image(self,cid,variant):
        self.checkpoint(cid)
        file=self.root/self.world['world_id']/(cid+('.raw' if variant=='raw' else '.enhanced.png'))
        if not file.is_file():raise HTTPException(404,'Image variant unavailable')
        return file
    def snapshot(self):
        return {**self.world,'epoch':self.s.epoch,'navigation':dict(self.nav.state),'trajectory':list(self.trajectory),'trajectory_offset':self.trajectory_total-len(self.trajectory),'trajectory_total':self.trajectory_total,'recovery':self.recovery,'nav_model':dict(NAV_MODEL),'limits':{'checkpoints':MAX_CHECKPOINTS,'trajectory_points':2048,'disk_mb':DISK_BUDGET//1024**2,'world_folders':MAX_WORLDS,'checkpoint_seconds':self.interval,'nav_event_hz':round(1/self.event_period,3)}}
    def navigation_since(self,since):
        """Light read: current pose plus trajectory points with absolute index >= since."""
        offset=self.trajectory_total-len(self.trajectory)
        start=max(0,min(len(self.trajectory),since-offset))
        return {'world_id':self.world['world_id'],'session_id':self.world['session_id'],'epoch':self.s.epoch,'navigation':dict(self.nav.state),'trajectory_offset':offset+start,'trajectory_total':self.trajectory_total,'trajectory':list(self.trajectory)[start:],'recovery_status':self.recovery['status'],'nav_model':dict(NAV_MODEL)}
    async def review(self,cid,approved,reviewer=None,reason=None):
        async with self.lock:
            cp=self.checkpoint(cid);cp['quality'].update(reviewed=True,approved=approved)
            cp['review']={'reviewed_at':now(),'reviewer':reviewer,'reason':reason}
            await asyncio.to_thread(write_json,self.root/self.world['world_id']/'world.json',self.world)
            self.emit('checkpoint_updated',{'checkpoint':cp});return cp
    def reposition(self,cp,anchor_kind='checkpoint_restore'):
        # A restored/reset segment starts at the anchor's copied ESTIMATED pose. It is never geometrically
        # connected to the previous segment; clients must break the trail on segment_id.
        self.latest=None
        self.nav.state={**cp['navigation'],'epoch':self.s.epoch,'segment_id':uuid.uuid4().hex,'relationship':'restored_view','control_seq':-1,'server_elapsed_ms':time.perf_counter()*1000,'anchor_kind':anchor_kind,'restored_from_checkpoint_id':cp['checkpoint_id']}
        self.append_trajectory(dict(self.nav.state))
    async def restore(self,req):
        s=self.s;self.find(req.session_id)
        if self.enhance_task and not self.enhance_task.done():raise HTTPException(409,'Enhancement active')
        if s.lifecycle_lock.locked():raise HTTPException(409,'Lifecycle action active')
        async with s.lifecycle_lock:
            self.find(req.session_id);cp=self.checkpoint(req.checkpoint_id)
            if not cp['quality']['approved'] and not req.accept_unreviewed:raise HTTPException(409,'Review checkpoint or explicitly accept unreviewed candidate')
            path=self.image(req.checkpoint_id,req.variant)
            await asyncio.to_thread(inspect_image,path.read_bytes())
            before=time.perf_counter();paused=s.status=='paused'
            self.recovery={'status':'restoring','checkpoint_id':req.checkpoint_id,'error':None}
            self.emit('recovery_started',dict(self.recovery))
            try:
                async with s.gpu_lock:
                    s.clear_controls()
                    await s.gpu(s.backend.restore_anchor,path,self.world['prompt'])
                    s.epoch+=1;s.status='paused' if paused else 'running'
                    for sub in s.subscribers.values():
                        sub.clear();sub.put({'type':'status','status':s.status,'epoch':s.epoch})
                    self.reposition(cp);s.wake.set()
                result={'session_id':req.session_id,'world_id':self.world['world_id'],'status':s.status,'epoch':s.epoch,'checkpoint_id':req.checkpoint_id,'recovery_ms':(time.perf_counter()-before)*1000}
                self.recovery={**result,'status':'completed','error':None}
                self.emit('recovery_completed',result);return result
            except Exception as exc:
                s.status='error';s.error=str(exc);self.recovery={'status':'failed','error':str(exc)}
                self.emit('recovery_failed',dict(self.recovery));raise HTTPException(503,str(exc)) from exc

    async def capture_anchor(self,sid,label='Clear view',enhance=True,strength=.35,restore_here=False):
        """Player-captured clear-view anchor at the current ESTIMATED pose: raw frame (evidence) + optional SDXL
        img2img enhanced variant (presentation/anchor). The player's action is the approval. Enhancement pauses
        Waypoint generation (shared GPU lock) for a few seconds."""
        s=self.s;self.find(sid)
        if self.anchor_busy:raise HTTPException(409,'Anchor capture already running')
        if s.lifecycle_lock.locked():raise HTTPException(409,'Lifecycle action active')
        if not self.latest:raise HTTPException(409,'No generated frame available')
        self.anchor_busy=True
        try:
            cp=await self.save(label,capture_reason='anchor')
            if enhance:
                from .scenes_backend import SceneBackend,MODEL as SDXL_MODEL,REVISION as SDXL_REVISION
                world=self.world;folder=self.root/world['world_id'];cid=cp['checkpoint_id']
                raw=await asyncio.to_thread((folder/(cid+'.raw')).read_bytes)
                with Image.open(io.BytesIO(raw)) as im:source=im.convert('RGB')
                seed=int.from_bytes(os.urandom(4),'little')
                self.emit('checkpoint_updated',{'checkpoint':cp,'status':'enhancing'})
                async with s.gpu_lock:
                    if self.scenes.backend is None:
                        self.scenes.backend=await s.gpu(SceneBackend,lambda *a:None)
                    image,stats=await s.gpu(self.scenes.backend.enhance,source,world['prompt'],strength,seed)
                    s.memory=await s.gpu(s.backend.memory)
                path=folder/(cid+'.enhanced.png')
                await asyncio.to_thread(image.save,path)
                data=await asyncio.to_thread(path.read_bytes)
                async with self.lock:
                    cp['enhanced_image_url']=f"/world/checkpoints/{cid}/image?session_id={world['session_id']}&variant=enhanced"
                    cp['enhancement_status']='ready'
                    cp['enhancement']={'model':SDXL_MODEL,'revision':SDXL_REVISION,'method':'img2img','strength':strength,'steps':30,'seed':seed,
                        'source_image_sha256':cp['image_sha256'],'enhanced_image_sha256':hashlib.sha256(data).hexdigest(),**stats,
                        'limitations':['AI-enhanced; may alter structure','Presentation/anchor image, not raw evidence']}
                    await asyncio.to_thread(write_json,folder/'world.json',world)
            cp=await self.review(cp['checkpoint_id'],True,'player','captured as clear-view anchor')
        finally:
            self.anchor_busy=False
        restored=None
        if restore_here and enhance:
            from types import SimpleNamespace
            restored=await self.restore(SimpleNamespace(session_id=sid,checkpoint_id=cp['checkpoint_id'],variant='enhanced',accept_unreviewed=False))
        return {'checkpoint':cp,'restored':restored}
