import assert from 'node:assert/strict'
import fs from 'node:fs'
import WebSocket from 'ws'
const base=process.env.ENGINE_TARGET||'http://127.0.0.1:8000'
const checks=[]
const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200,path);return r.json()}
const health=await get('/health');assert.equal(health.model_loaded,true);assert.equal(health.prompt_conditioning,false)
assert.ok(['ready','running','paused'].includes(health.status));checks.push('Real model-loaded health schema')
const openapi=await get('/openapi.json')
for(const path of ['/scenes/generate','/scenes/jobs/{job_id}','/scenes','/scenes/{scene_id}','/scenes/{scene_id}/image','/world/start','/world/reset','/world/pause','/world/resume','/world/stop','/world/metrics']) assert.ok(openapi.paths[path],path)
checks.push('Documented HTTP endpoints present')
const bad=await fetch(base+'/scenes/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'a forest',style:'fantasy',width:1280,height:720})})
assert.equal(bad.status,422);checks.push('Unsupported width/height rejected rather than silently ignored')
const list=await get('/scenes?limit=100');assert.ok(list.scenes.some(s=>s.scene_id==='facility'));assert.ok(list.scenes.some(s=>s.kind==='generated'))
for(const m of list.scenes.filter(s=>s.kind==='generated').slice(0,6)) {
 const scene=await get('/scenes/'+m.scene_id);assert.equal(scene.world_start_request.scene_id,m.scene_id)
 const image=await fetch(base+scene.image_url);assert.equal(image.status,200);assert.ok(image.headers.get('content-type').startsWith('image/'))
}
checks.push('Saved metadata, seed paths and genuine image endpoints available')
const sid=process.env.SESSION_ID
if(sid) {
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/world/stream?session_id='+sid)
 let meta=null,count=0,prev=0
 try {
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('No real JPEG frames in 30s')),30000)
   ws.on('error',reject)
   ws.on('message',(data,binary)=>{
    try {
     if(!binary){const m=JSON.parse(data);if(m.type==='frame')meta=m;else if(m.type==='error')throw new Error(JSON.stringify(m));return}
     assert.ok(meta);assert.equal(meta.encoding,'jpeg');assert.equal(meta.batch_size,4);assert.equal(meta.width,640);assert.equal(meta.height,360)
     assert.ok(meta.frame_id>prev);prev=meta.frame_id;assert.equal(data[0],255);assert.equal(data[1],216)
     ws.send(JSON.stringify({type:'display_ack',frame_id:meta.frame_id,epoch:meta.epoch,client_elapsed_ms:performance.now()}));meta=null
     if(++count===16){clearTimeout(timeout);resolve()}
    } catch(err){clearTimeout(timeout);reject(err)}
   })
  })
  checks.push('16 actual frame JSON + separate complete JPEG messages and credit acknowledgments verified')
 } finally {ws.close()}
}
const result={passed:true,checks,health,websocket_checked:!!sid}
if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
