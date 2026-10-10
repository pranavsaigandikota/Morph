"""One-off A0 experiment: exact per-batch controls, accepted Backend unchanged.
Stop only the owned idle experimental server before invoking this script.
No degree mapping, calibration API or navigation-map integration is installed.
"""
import argparse,hashlib,io,json,sys,time,urllib.request,urllib.error
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    p=argparse.ArgumentParser();p.add_argument('--backend',required=True);p.add_argument('--scenes',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    # Never share the GPU with a live inference world, or duplicate the experimental model.
    try:
        urllib.request.urlopen('http://127.0.0.1:8002/health',timeout=2)
    except urllib.error.HTTPError:raise SystemExit('Experimental8002 is reachable; stop it before the exact-batch probe')
    except urllib.error.URLError:pass
    else:raise SystemExit('Stop the owned experimental8002 service before the exact-batch A0 probe')
    h=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2))
    if h['status'] not in ('ready','paused'):raise SystemExit('Archived service may be inferring; do not run concurrently')
    scenes=json.loads(Path(a.scenes).read_text());assert len(scenes)>=3
    for s in scenes:
        assert s['width']==1280 and s['height']==720 and s['steps']==30
    sys.path.insert(0,str(Path(a.backend).resolve()))
    from worldshift.backend import Backend,MODEL,encode
    assert MODEL=='Overworld/Waypoint-1.5-1B'
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    backend=Backend();manifest={'model':MODEL,'quant':'fp8w8a8','model_load_count':1,'model_load_seconds':backend.load_seconds,'architecture_commit':'d52fdc2e91450aa92b7e1b45733d2f4e29c5fc5e','controls':'exact Backend.generate([], (m,0)) per batch; 10 turn +4 zero; reset each magnitude','api_changes':False,'source_scenes':scenes,'runs':[],'human_review':'pending','errors':[]}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    try:
        for n,scene in enumerate(scenes):
            seed=Path(scene['world_start_request']['seed_image_path'])
            for magnitude in (.5,1,2,4,8,16,32):
                h=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2))
                if h['status'] not in ('ready','paused'):raise RuntimeError('Archived world resumed; aborting simultaneous inference')
                folder=out/f'scene-{n+1}-m{magnitude:g}';folder.mkdir();rows=[]
                started=time.perf_counter();backend.initialize(seed,scene['prompt']);init_ms=(time.perf_counter()-started)*1000
                # The original seed is baseline evidence; no generated anchor is reused.
                Image.open(seed).convert('RGB').save(folder/'seed.png')
                with (folder/'batches.jsonl').open('w') as log:
                    for batch in range(14):
                        mouse=(magnitude if batch<10 else 0.,0.)
                        tick=time.perf_counter();frames,at,inference,transfer,memory=backend.generate([],mouse)
                        jpeg,encoding=encode(frames);raw=jpeg[-1];file=f'batch-{batch+1:02}.jpg';(folder/file).write_bytes(raw)
                        row={'evidence':'MEASURED','batch':batch+1,'phase':'turn' if batch<10 else 'settle','keys':[],'applied_mouse':mouse,'file':file,'sha256':hashlib.sha256(raw).hexdigest(),'frames':len(jpeg),'inference_ms':inference,'transfer_ms':transfer,'encoding_ms':encoding,'batch_ms':(time.perf_counter()-tick)*1000,'generated_at_server_monotonic_ms':at,**memory}
                        rows.append(row);log.write(json.dumps(row)+'\n');log.flush()
                backend.reset()
                manifest['runs'].append({'scene':n+1,'scene_id':scene['scene_id'],'magnitude':magnitude,'folder':folder.name,'init_ms':init_ms,'generated_frames':sum(x['frames'] for x in rows),'active_generated_fps':sum(x['frames'] for x in rows)/(sum(x['batch_ms'] for x in rows)/1000),'rows':len(rows)})
                (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
                print(f"Scene {n+1}, magnitude {magnitude:g}: exact10 turn+4 settle batches complete",flush=True)
    except Exception as e:
        manifest['errors'].append(repr(e));raise
    finally:
        backend.reset();(out/'manifest.json').write_text(json.dumps(manifest,indent=2))

if __name__=='__main__':main()
