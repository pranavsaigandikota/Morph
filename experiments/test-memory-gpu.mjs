import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url), WebSocket=require('ws');
const base='http://127.0.0.1:8002';
const out=`C:/Users/filma/Documents/Codex/2026-10-10/wo/outputs/world-memory/run-${Date.now()}`;
await fs.mkdir(out,{recursive:true});
const report={errors:[],events:{},restores:[],checks:{},frames:0,gaps:0,staleFrames:0,envelopeErrors:0,ackLatency:[],samples:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body,expected=200){
 const r=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const data=await r.json();if(r.status!==expected)throw Error(`${path}: ${r.status} ${JSON.stringify(data)}`);return data;
}
let sid, ws, pending, first, previous, frameAt=0, currentEpoch=0, seq=0, trajectory='forward', clock=performance.now(), framesAt=0;
const sent=new Map();
async function connect(){
 ws=new WebSocket(`ws://127.0.0.1:8002/world/stream?session_id=${sid}`);
 ws.on('message',(data,binary)=>{
  try{
   if(!binary){const m=JSON.parse(data);report.events[m.type]=(report.events[m.type]||0)+1;
    if(m.type==='hello'||m.type==='status'){currentEpoch=m.epoch;pending=null;}
    if(m.type==='frame'){if(pending)report.envelopeErrors++;pending=m;}
    if(m.type==='control_ack'&&sent.has(m.seq)){report.ackLatency.push(performance.now()-sent.get(m.seq));sent.delete(m.seq);}
    if(m.type==='error')report.errors.push(m);
    return;
   }
   if(!pending){report.envelopeErrors++;return;}const m=pending;pending=null;
   ws.send(JSON.stringify({type:'display_ack',frame_id:m.frame_id,epoch:m.epoch,client_elapsed_ms:performance.now()-clock}));
   if(m.epoch!==currentEpoch)report.staleFrames++;
   if(previous&&m.epoch===previous.epoch&&m.frame_id!==previous.frame_id+1)report.gaps++;
   previous=m;first??=performance.now();report.frames++;
   if(data[0]!==255||data[1]!==216)report.envelopeErrors++;
   if(performance.now()-frameAt>1000){frameAt=performance.now();const file=`frame-${m.epoch}-${m.frame_id}.jpg`;fs.writeFile(out+'/'+file,data).catch(e=>report.errors.push(String(e)));report.samples.push({file,...m,client_received_elapsed_ms:frameAt-clock});}
  }catch(e){report.errors.push(String(e));}
 });
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
}
let timer;
try{
 let ready=false;
 for(let i=0;i<120;i++){try{const h=await api('/health');if(h.status==='ready'){ready=true;break;}}catch{}await delay(1000);}
 if(!ready)throw Error('Backend not ready after120s');
 const scene=await api('/scenes/9778710e48214c62827fa991a313ec91');
 const start=await api('/world/start',scene.world_start_request);sid=start.session_id;report.start=start;
 await connect();
 timer=setInterval(()=>{if(ws.readyState!==WebSocket.OPEN)return;const t=performance.now()-clock;const control={type:'control',seq:++seq,keys:trajectory==='forward'?['w']:trajectory==='mixed'?(seq%40<20?['w']:['d']):[],mouse_dx:trajectory==='mixed'?1:0,mouse_dy:trajectory==='mixed'?Math.sin(t/1000)*.2:0,timestamp_ms:t};sent.set(seq,performance.now());ws.send(JSON.stringify(control));},50);
 for(let i=0;!first&&i<180;i++)await delay(1000);if(!first)throw Error('No genuine decoded frames within180s');
 const begin=performance.now();framesAt=report.frames;const saved=[];
 const initial=await api(`/world/memory?session_id=${sid}`);report.initial=initial;report.checks.initialCheckpoint=initial.checkpoints.length>=1;
 for(let cycle=0;cycle<5;cycle++){await delay(4000);saved.push(await api('/world/checkpoints/save',{session_id:sid,label:`Validation ${cycle+1}`}));}
 report.checks.fiveSaved=saved.length===5;
 await api('/world/pause',{session_id:sid});const paused=await api(`/world/memory?session_id=${sid}`);await delay(1000);const pausedAfter=await api(`/world/memory?session_id=${sid}`);report.checks.pausePoseHeld=JSON.stringify(paused.navigation)===JSON.stringify(pausedAfter.navigation);await api('/world/resume',{session_id:sid});
 const beforeInvalid=await api(`/world/memory?session_id=${sid}`);await api('/world/checkpoints/restore',{session_id:sid,checkpoint_id:'does-not-exist',variant:'raw',accept_unreviewed:true},404);report.checks.failedPreflightKeepsEpoch=(await api(`/world/memory?session_id=${sid}`)).epoch===beforeInvalid.epoch;
 trajectory='mixed';
 for(let i=0;i<3;i++){
  const before=await api(`/world/memory?session_id=${sid}`);
  const result=await api('/world/checkpoints/restore',{session_id:sid,checkpoint_id:saved[i].checkpoint_id,variant:'raw',accept_unreviewed:true});report.restores.push(result);
  report.checks[`restore${i+1}`]=result.epoch===before.epoch+1&&result.session_id===sid&&result.world_id===initial.world_id;
  await delay(5000);
 }
 await api('/world/reset',{session_id:sid});const reset=await api(`/world/memory?session_id=${sid}`);report.checks.resetOriginalPose=reset.navigation.x===0&&reset.navigation.z===0;
 ws.close();await delay(300);pending=null;previous=null;await connect();await delay(3000);report.checks.reconnect=ws.readyState===WebSocket.OPEN;
 while(performance.now()-begin<60000)await delay(500);
 report.duration_seconds=(performance.now()-begin)/1000;report.received_fps=(report.frames-framesAt)/report.duration_seconds;
 report.final=await api(`/world/memory?session_id=${sid}`);report.metrics=await api('/world/metrics');
 for(const cp of saved){const response=await fetch(base+cp.image_url);const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(out+`/checkpoint-${cp.checkpoint_id}.jpg`,bytes);if(!response.ok)throw Error('Checkpoint image unavailable');}
 clearInterval(timer);ws.close();await api('/world/stop',{session_id:sid});
 const switched=await api('/world/start',scene.world_start_request);const next=await api(`/world/memory?session_id=${switched.session_id}`);report.checks.worldIsolation=next.world_id!==initial.world_id&&next.checkpoints.length===1;
 await api(`/world/memory?session_id=${sid}`,undefined,404);await api('/world/stop',{session_id:switched.session_id});
 report.canvas_fps=null;report.canvas_note='Headless protocol test; no browser draws measured. JPEG decode validated separately with Pillow.';
}catch(e){report.errors.push(String(e));if(sid){try{await api('/world/stop',{session_id:sid});}catch{}}}
finally{clearInterval(timer);ws?.close();await fs.writeFile(out+'/gpu-checkpoint-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors:report.errors,frames:report.frames,received_fps:report.received_fps,restores:report.restores,gaps:report.gaps,staleFrames:report.staleFrames,envelopeErrors:report.envelopeErrors}));}
