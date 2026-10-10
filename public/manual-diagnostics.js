// Opt-in observational experiment. Never handles streaming, credits or frame queues.
const q=new URLSearchParams(location.search),standalone=!!document.getElementById('micro');
const enabled=standalone||q.get('schedulingProbe')==='1'||q.get('manualCapture')==='1';
if(enabled) setup();
function setup(){
 const now=()=>performance.now(),$=id=>document.getElementById(id);let current=null,lastResult=null;
 const summary=a=>({count:a.length,p50:percentile(a,.5),p95:percentile(a,.95),max:a.length?Math.max(...a):null});
 function percentile(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)*p)];}
 function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(!standalone){const panel=document.createElement('aside');panel.style='position:fixed;bottom:12px;right:12px;z-index:99999;background:#10151bef;color:white;padding:12px;max-width:420px;max-height:85vh;overflow:auto;font:13px system-ui';
 panel.innerHTML='<b>EXPERIMENT — manual measurements</b><br><button id="start">Measure Explorer 30 seconds</button><button id="download">Download timing JSON</button><pre id="result" style="max-height:130px;overflow:auto;white-space:pre-wrap">Ready — release movement keys before captures.</pre><div id="capturePanel"></div>';document.body.append(panel);
 }
 $('download').onclick=()=>lastResult&&download('worldshift-scheduling-'+Date.now()+'.json',lastResult);
 $('start').onclick=async()=>{
  if(current)return;const mode=standalone?$('mode').value:'explorer';$('start').disabled=true;
  let bytes,bitmap;try{if(mode==='decode'||mode==='draw'){const image=await fetch('/scheduling-reference.jpg');if(!image.ok)throw Error('Reference JPEG HTTP '+image.status);bytes=await image.blob();if(mode==='draw')bitmap=await createImageBitmap(bytes);}}catch(e){$('result').textContent=String(e);$('start').disabled=false;return;}
  const canvas=standalone?$('micro'):document.querySelector('canvas[data-telemetry]');
  if(!standalone&&!canvas){$('result').textContent='Start the real Explorer first; no telemetry canvas found.';$('start').disabled=false;return;}
  const ctx=standalone?canvas.getContext('2d'):null;
  const initial=canvas?.dataset.telemetry?JSON.parse(canvas.dataset.telemetry):null;
  if(!standalone&&(!initial||!initial.received)){$('result').textContent='Wait for the first genuine frame before measuring.';$('start').disabled=false;return;}
  const r={mode,url:location.href,user_agent:navigator.userAgent,duration_ms:30000,visibility:[],raf_intervals:[],decode_ms:[],draw_ms:[],long_tasks:[],errors:[],initial_telemetry:initial,power_saver:'Not observable through this page; record Brave settings manually',automatic_control:false};
  current=r;let previous=0,callbacks=0,decodeBusy=false,raf,done=false;const begin=now();
  const sample=()=>r.visibility.push({elapsed_ms:now()-begin,state:document.visibilityState,focus:document.hasFocus()});sample();
  const vis=setInterval(sample,1000);const observer=new PerformanceObserver(list=>{for(const x of list.getEntries())r.long_tasks.push({at_ms:x.startTime-begin,duration_ms:x.duration});});try{observer.observe({entryTypes:['longtask']});}catch{}
  // Explorer-only timing wrappers are restored at the end. They never alter src/queue order.
  const proto=CanvasRenderingContext2D.prototype,originalDraw=proto.drawImage;
  const imageProto=HTMLImageElement.prototype,srcDescriptor=Object.getOwnPropertyDescriptor(imageProto,'src');
  if(mode==='explorer'){
   proto.drawImage=function(...args){const t=now();try{return originalDraw.apply(this,args);}finally{if(this.canvas===canvas&&!done)r.draw_ms.push(now()-t);}};
   Object.defineProperty(imageProto,'src',{...srcDescriptor,set(value){if(String(value).startsWith('blob:')){const t=now();this.addEventListener('load',()=>{if(!done)r.decode_ms.push(now()-t);},{once:true});this.addEventListener('error',()=>{if(!done)r.errors.push('Image load error');},{once:true});}return srcDescriptor.set.call(this,value);}});
  }
  function tick(t){if(done)return;callbacks++;if(previous)r.raf_intervals.push(t-previous);previous=t;
   if(mode==='draw'){const s=now();ctx.drawImage(bitmap,0,0);r.draw_ms.push(now()-s);}
   if(mode==='decode'&&!decodeBusy){decodeBusy=true;const s=now();createImageBitmap(bytes).then(b=>{if(!done)r.decode_ms.push(now()-s);b.close();}).catch(e=>r.errors.push(String(e))).finally(()=>decodeBusy=false);}
   raf=requestAnimationFrame(tick);
  }
  raf=requestAnimationFrame(tick);
  const status=setInterval(()=>$('result').textContent=JSON.stringify({mode,elapsed_s:((now()-begin)/1000).toFixed(1),callbacks,visibility:document.visibilityState,focus:document.hasFocus()},null,2),1000);
  setTimeout(()=>{
   done=true;cancelAnimationFrame(raf);clearInterval(vis);clearInterval(status);observer.disconnect();bitmap?.close();
   if(mode==='explorer'){proto.drawImage=originalDraw;Object.defineProperty(imageProto,'src',srcDescriptor);}
   r.actual_elapsed_ms=now()-begin;r.raf_callback_rate=callbacks/(r.actual_elapsed_ms/1000);r.raf_summary=summary(r.raf_intervals);r.decode_summary=summary(r.decode_ms);r.draw_summary=summary(r.draw_ms);
   const final=canvas?.dataset.telemetry?JSON.parse(canvas.dataset.telemetry):null;r.final_telemetry=final;
   if(initial&&final){r.same_session=initial.session_id===final.session_id;r.same_epoch=initial.epoch===final.epoch;r.received_fps=(final.received-initial.received)/(r.actual_elapsed_ms/1000);r.canvas_fps=(final.displayed-initial.displayed)/(r.actual_elapsed_ms/1000);r.presentation_skips=final.presentation_drops-initial.presentation_drops;r.decode_errors=final.decode_errors-initial.decode_errors;r.protocol_errors=final.protocol_errors-initial.protocol_errors;r.server=final.server;}
   r.limitations=['JS drawImage duration is submission time, not GPU compositor time','Explorer image src-to-load includes dispatch/loading and decode; it is not pure decoder CPU time','Standalone createImageBitmap uses a cached JPEG; it is a microbenchmark, not streaming throughput','No GPU frame or acknowledgment protocol modifications'];
   lastResult=r;current=null;const brief=t=>t?{received:t.received,displayed:t.displayed,session_id:t.session_id,epoch:t.epoch,server:t.server}:null;
   $('result').textContent=JSON.stringify({...r,raf_intervals:undefined,decode_ms:undefined,draw_ms:undefined,initial_telemetry:brief(initial),final_telemetry:brief(final),visibility:r.visibility.slice(-3)},null,2);$('start').disabled=false;
  },30000);
 };
 if(!standalone&&q.get('manualCapture')==='1') setupCapture(download,$);
}
function setupCapture(download,$){
 let original=null,sid=null,records=[],busy=false;const totals={dx:0,dy:0};
 document.addEventListener('mousemove',e=>{totals.dx+=e.movementX||0;totals.dy+=e.movementY||0;});
 $('capturePanel').innerHTML='<hr><b>Manual look-and-capture</b><br><button id="reviewOriginal">Review original seed</button><input id="viewLabel" placeholder="Relative view label (no degrees)"><button id="saveView">Save / review view</button><button id="finishSurvey">Finish: restore original seed</button><button id="exportViews">Export capture manifest</button><div id="captureResult"></div>';
 const telemetry=()=>{const c=document.querySelector('canvas[data-telemetry]');if(!c)throw Error('Start the real Explorer first');const t=JSON.parse(c.dataset.telemetry);if(!t.session_id||t.phase!=='streaming')throw Error('A live running session is required');return t;};
 async function api(path,body){const r=await fetch('/engine'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;}
 async function resumeExplorer(){
  // Existing adapter updates its local phase through its own Resume action.
  // An external HTTP resume alone does not update that phase in this release.
  const button=[...document.querySelectorAll('main button')].find(b=>b.textContent.trim()==='Resume');
  if(!button)throw Error('Use the Explorer Resume button, then continue this survey');
  button.click();for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));try{telemetry();return;}catch{}}
  throw Error('Explorer did not resume; use its Resume control before continuing');
 }
 async function ownership(requireApproval=true){const t=telemetry();if(sid&&sid!==t.session_id)throw Error('Session changed: reload this survey panel');sid=t.session_id;const m=await api('/world/memory?session_id='+encodeURIComponent(sid));original=m.checkpoints.find(c=>c.provenance==='initial_seed'&&c.frame_id===null&&c.label==='Initial seed');if(!original||(requireApproval&&!original.quality?.approved))throw Error('Review and approve the original seed before surveying');return t;}
 $('reviewOriginal').onclick=async()=>{if(busy)return;try{await ownership(false);const panel=$('captureResult');panel.replaceChildren();const image=document.createElement('img');image.src='/engine'+original.image_url;image.style='width:100%';panel.append(image);const approve=document.createElement('button');approve.textContent='Approve this original seed';approve.onclick=async()=>{try{original=await api('/world/checkpoints/'+original.checkpoint_id+'/review',{session_id:sid,approved:true});panel.textContent='Original seed approved. Look naturally, then release movement keys before saving.';}catch(e){panel.textContent=String(e);}};panel.append(approve);}catch(e){$('captureResult').textContent=String(e);}};
 $('saveView').onclick=async()=>{
  if(busy)return;busy=true;let paused=false;
  try{const t=await ownership();const label=$('viewLabel').value.trim();if(!label)throw Error('Provide a relative label, e.g. left doorway');
   await api('/world/pause',{session_id:sid});paused=true;
   const cp=await api('/world/checkpoints/save',{session_id:sid,label});
   const record={checkpoint:cp,last_received_at_request:{frame_id:t.last_frame_id,epoch:t.epoch},orientation:{estimated_relative_label:label,angle_degrees:null,cumulative_dom_mouse: {...totals},source:'user_label_and_unscaled_DOM_mouse_observation',uncertainty:'unbounded; not camera pose; DOM totals may include movement outside the viewport'},provenance:'server original raw JPEG; checkpoint frame identity is authoritative',review:'pending'};
   const panel=$('captureResult');panel.replaceChildren();const image=document.createElement('img');image.src='/engine'+cp.image_url;image.style='width:100%';panel.append(image);
   const note=document.createElement('p');note.textContent='Review this actual stored checkpoint. It may differ from the displayed frame at the request. Do not approve a distorted view.';panel.append(note);
   for(const [text,approved] of [['Accept recognizable view',true],['Reject view',false]]){const button=document.createElement('button');button.textContent=text;button.onclick=async()=>{try{record.checkpoint=await api('/world/checkpoints/'+cp.checkpoint_id+'/review',{session_id:sid,approved});record.review=approved?'operator_approved':'operator_rejected';records.push(record);await resumeExplorer();panel.textContent=record.review+' — continue looking naturally.';busy=false;}catch(e){panel.textContent=String(e);busy=false;}};panel.append(button);}
   // Leave paused until the human accepts or rejects the actual raw image.
   return;
  }catch(e){$('captureResult').textContent=String(e);if(paused)await resumeExplorer().catch(()=>{});busy=false;}
 };
 $('finishSurvey').onclick=async()=>{if(busy)return;busy=true;try{await ownership();const result=await api('/world/reset',{session_id:sid});records.push({event:'restore_approved_original_seed',result,orientation:{angle_degrees:null,uncertainty:'new segment; exact viewpoint correspondence unknown'}});$('captureResult').textContent='Original seed restored. Epoch '+result.epoch+'. Begin exploration.';}catch(e){$('captureResult').textContent=String(e);}finally{busy=false;}};
 $('exportViews').onclick=()=>download('manual-look-capture-'+Date.now()+'.json',{schema:'manual-look-capture-experiment-v1',session_id:sid,original_checkpoint:original,records,exact_degrees:false,limitations:['No calibrated yaw, FOV or geometry','Server checkpoint may be newer than the last displayed frame','Only human-approved raw images belong in the reference set','No automatic rotation, spatial map or obstacle integration']});
}
