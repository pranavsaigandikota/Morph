const $=id=>document.getElementById(id), canvas=$('video'), ctx=canvas.getContext('2d');
const profile='720';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), now=()=>performance.now();
let ws,sid,epoch,pending,latest,drawing=false,active=false,stop=false,recovering=false,seq=0,run,lastDraw=0,lastSample=0,lastId=0,timer,reference,queue=[],lastRaf=0,lastArrival=0,lastRecovery=0,movingFrames=0,rotation=0,observer;
async function api(path,body){const r=await fetch('/engine'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});if(!r.ok)throw Error(`${path} ${r.status} ${await r.text()}`);return r.json();}
function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
async function save(name,data,base64){const r=await fetch('/__benchmark/v1/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({run:run.id,name,data,base64})});if(!r.ok)throw Error(await r.text());}
const elapsed=()=>run?(now()-run.start)/1000:0;
function controls(empty=false){if(ws?.readyState!==1)return;const p=elapsed()%12, keys=empty?[]:p<6?['w']:p<8?['a']:p<10?['s']:['d'];const m={type:'control',seq:++seq,keys,mouse_dx:empty?0:p>=6&&p<8?.5:0,mouse_dy:empty?0:p>=10?.15:0,timestamp_ms:now()};run.sent[m.seq]=m.timestamp_ms;run.sentKeys[m.seq]=keys;if(!empty)rotation+=Math.abs(m.mouse_dx)+Math.abs(m.mouse_dy);ws.send(JSON.stringify(m));}
async function paint(t){
 requestAnimationFrame(paint);
 if(!active)return;
 if(lastRaf&&run.measuring)run.raf_ms.push(t-lastRaf);lastRaf=t;
 if(drawing||t-lastDraw<1000/30)return;
 if(run.presenter==='paced'){
   while(queue.length&&(now()-queue[0].received>140||queue[0].meta.epoch!==epoch)){queue.shift();run.presentation_skips++;}
 }
 const f=run.presenter==='paced'?queue.shift():latest;if(!f)return;
 if(run.presenter!=='paced')latest=null;
 drawing=true;lastDraw=t;
 try{
   const start=now(),bitmap=await createImageBitmap(new Blob([f.bytes],{type:'image/jpeg'}));run.decode_ms.push(now()-start);
   if(f.meta.epoch===epoch){
     canvas.width!==f.meta.width&&(canvas.width=f.meta.width);canvas.height!==f.meta.height&&(canvas.height=f.meta.height);
     const drawn=now();ctx.drawImage(bitmap,0,0);run.draw_ms.push(now()-drawn);run.queue_age_ms.push(drawn-f.received);run.displayed++;
     if(run.sent[f.meta.seq]!==undefined&&!run.applied.has(f.meta.seq)){run.applied.add(f.meta.seq);run.control_to_draw_ms.push(now()-run.sent[f.meta.seq]);}
     const tr=run.transitions.at(-1);if(tr&&tr.epoch===epoch&&tr.first_draw_ms===null)tr.first_draw_ms=now()-tr.start;
   }bitmap.close();
 }catch(e){run.decode_errors++;run.errors.push(String(e));}finally{drawing=false;}
}
requestAnimationFrame(paint);
async function openStream(){await new Promise((resolve,reject)=>{ws=new WebSocket(`ws://${location.host}/engine/world/stream?session_id=${sid}`);ws.binaryType='arraybuffer';ws.onopen=resolve;ws.onerror=reject;ws.onmessage=event=>{
 if(typeof event.data==='string'){const m=JSON.parse(event.data);if(m.type==='hello'||m.type==='status'){if(m.epoch!==epoch){epoch=m.epoch;latest=null;queue=[];pending=null;lastId=0;}}else if(m.type==='frame'){if(pending)run.protocol_errors++;pending=m;}else if(m.type==='control_ack')run.ack_ms.push(now()-m.timestamp_ms);else if(m.type==='error')run.errors.push(m);return;}
 const m=pending;pending=null;if(!m){run.protocol_errors++;return;}const bytes=new Uint8Array(event.data);ws.send(JSON.stringify({type:'display_ack',frame_id:m.frame_id,epoch:m.epoch,client_elapsed_ms:now()}));
 if(m.epoch!==epoch){run.stale_frames++;return;}if(lastId&&m.frame_id!==lastId+1)run.gaps+=Math.max(0,m.frame_id-lastId-1);lastId=m.frame_id;run.received++;
 const at=now(),f={bytes,meta:m,received:at};if(run.measuring&&lastArrival)run.arrival_ms.push(at-lastArrival);lastArrival=at;
 if(run.presenter==='paced'){if(queue.length>=4){queue.shift();run.presentation_skips++;}queue.push(f);run.max_queue=Math.max(run.max_queue,queue.length);}else{if(latest)run.presentation_skips++;latest=f;}
 run.first??=at;
 if(run.measuring&&run.sentKeys[m.seq]?.length)movingFrames++;
 const tr=run.transitions.at(-1);if(tr&&m.epoch===tr.epoch&&tr.first_frame_ms===null)tr.first_frame_ms=now()-tr.start;
 if(run.measuring&&now()-lastSample>=200){lastSample=now();const file=`frame-${String(run.samples.length).padStart(5,'0')}.jpg`;run.samples.push({file,t:elapsed(),frame_id:m.frame_id,epoch,sid});void save(file,null,b64(bytes)).catch(e=>run.errors.push(String(e)));}
 };ws.onclose=e=>{if(active&&!stop&&run.measuring)run.errors.push(`Unexpected close ${e.code}`);};});}
async function restore(cycle,reason='fixed-15s'){if(recovering)return;recovering=true;controls(true);$('notice').textContent='Transitioning to a clean, theme-consistent scene';const cp=run.mode==='original'?reference.checkpoints[0]:reference.checkpoints[1+cycle%3];const tr={cycle:cycle+1,reason,segment_moving_frames:movingFrames,segment_rotation:rotation,mode:run.mode,checkpoint_id:cp.checkpoint_id,source_kind:cp.source_kind||'original_sdxl_seed',t:elapsed(),start:now(),first_frame_ms:null,first_draw_ms:null,epoch:epoch+1};run.transitions.push(tr);try{const result=await api('/world/checkpoints/restore',{session_id:sid,checkpoint_id:cp.checkpoint_id,variant:'raw',accept_unreviewed:true});tr.epoch=result.epoch;tr.request_ms=now()-tr.start;tr.result=result;run.epochs.push({t:elapsed(),epoch:result.epoch,sid});lastRecovery=elapsed();movingFrames=0;rotation=0;}finally{recovering=false;$('notice').textContent='';}}
async function caseRun(mode,presenter,policy){const health=await api('/health'),scene=await api('/scenes/9bda60c5d71a411680f71969c487684d');if(health.model!=='Overworld/Waypoint-1.5-1B')throw Error('Native 720p backend required');run={id:`native720-${presenter}-${mode}-${policy}-${Date.now()}`,mode,presenter,policy,profile,trajectory:'mixed',scene,health,start:now(),received:0,displayed:0,presentation_skips:0,gaps:0,stale_frames:0,decode_errors:0,protocol_errors:0,errors:[],samples:[],transitions:[],epochs:[],metrics:[],visibility:[],ack_ms:[],decode_ms:[],control_to_draw_ms:[],initialization_ms:[],sent:{},sentKeys:{},applied:new Set(),first:null,measuring:false,raf_ms:[],arrival_ms:[],draw_ms:[],queue_age_ms:[],long_tasks:[],max_queue:0};
 active=true;seq=0;epoch=-1;latest=null;queue=[];pending=null;lastId=0;lastSample=0;lastRaf=0;lastArrival=0;lastRecovery=0;movingFrames=0;rotation=0;
 observer=new PerformanceObserver(list=>{if(run.measuring)for(const e of list.getEntries())run.long_tasks.push({t:e.startTime-run.start,ms:e.duration});});observer.observe({type:'longtask',buffered:false});
 try{const started=await api('/world/start',scene.world_start_request);sid=started.session_id;run.sessions=[sid];reference=await api(`/world/memory?session_id=${sid}`);run.reference_checkpoints=reference.checkpoints;await openStream();while(!run.first&&!stop){if(elapsed()>120)throw Error('Warmup timeout');await sleep(20);}while(!run.displayed&&!stop)await sleep(20);run.warmup_ms=now()-run.start;run.start=now();run.measurement_unix_s=Date.now()/1000;run.received=run.displayed=run.presentation_skips=0;run.ack_ms=[];run.epochs=[{t:0,epoch,sid}];run.measuring=true;let cycle=0,nextShot=0,nextMetric=0;
 timer=setInterval(()=>{if(active&&!recovering&&!stop)controls();},50);
 while(elapsed()<60&&!stop){const t=elapsed();if(t>=nextShot){await save(`canvas-${String(nextShot).padStart(2,'0')}.png`,null,canvas.toDataURL('image/png').split(',')[1]);nextShot+=15;}if(t>=nextMetric){run.metrics.push({t,metrics:await api('/world/metrics')});run.visibility.push({t,state:document.visibilityState,focus:document.hasFocus()});nextMetric+=1;}
 if(!recovering&&mode!=='none'){
   if(policy==='fixed'&&t-lastRecovery>=15)await restore(run.transitions.length);
   else if(policy==='risk'&&t-lastRecovery>=8&&(movingFrames>=200||rotation>=40||t-lastRecovery>=15))await restore(run.transitions.length,movingFrames>=200?'moving-frame-budget':rotation>=40?'rotation-budget':'max-segment-time');
 } $('stats').textContent=JSON.stringify({profile,presenter,mode,policy,t:elapsed().toFixed(1),received:run.received,displayed:run.displayed,cycles:run.transitions.length,errors:run.errors},null,2);await sleep(50);}
 run.seconds=elapsed();await save('canvas-end.png',null,canvas.toDataURL('image/png').split(',')[1]);run.final_metrics=await api('/world/metrics');
 }catch(e){run.errors.push(String(e));stop=true;}finally{clearInterval(timer);run.measuring=false;observer.disconnect();controls(true);if(sid)await api('/world/stop',{session_id:sid}).catch(e=>run.errors.push(String(e)));ws?.close();active=false;latest=null;queue=[];sid=null;delete run.sent;delete run.sentKeys;delete run.applied;await save('report.json',run);}
 return {run:run.id,seconds:run.seconds,received_fps:run.received/run.seconds,canvas_fps:run.displayed/run.seconds,errors:run.errors};}
$('run').onclick=async()=>{if(active)return;stop=false;const results=[];for(const [mode,presenter,policy] of [['original','latest','fixed'],['original','paced','fixed'],['fresh','paced','fixed'],['fresh','paced','risk']]){results.push(await caseRun(mode,presenter,policy));if(stop)break;} $('stats').textContent=JSON.stringify({complete:true,results},null,2);canvas.dataset.result=JSON.stringify(results);};
$('refresh').onclick=()=>{if(active&&run.measuring&&sid&&reference&&!recovering)void restore(run.transitions.length,'manual').catch(e=>{run.errors.push(String(e));stop=true;});};
$('stop').onclick=()=>{stop=true;controls(true);};
