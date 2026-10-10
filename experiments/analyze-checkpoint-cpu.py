"""OFFLINE optional observation prototype; deliberately NOT connected to REST.
Cursor must approve OBSTACLE_SCHEMA_PROPOSAL.md before API activation.
"""
import os
os.environ['CUDA_VISIBLE_DEVICES']=''
os.environ.setdefault('HF_HUB_DISABLE_XET','1')
import argparse
import hashlib
import json
from pathlib import Path
import ssl
import time
import uuid

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--image',required=True)
    p.add_argument('--checkpoint-json',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--cache',required=True)
    p.add_argument('--depth-revision')
    p.add_argument('--detector-revision')
    args=p.parse_args()
    import httpx
    from huggingface_hub import HfApi,set_client_factory
    set_client_factory(lambda:httpx.Client(verify=ssl.create_default_context(),follow_redirects=True))
    import torch
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    from transformers import AutoImageProcessor,AutoModelForDepthEstimation,OwlViTProcessor,OwlViTForObjectDetection
    import numpy as np
    from PIL import Image
    path=Path(args.image);raw=path.read_bytes()
    cp=json.loads(Path(args.checkpoint_json).read_text(encoding='utf-8-sig'))
    if cp['provenance'] not in ('initial_seed','raw_video_frame'):raise ValueError('Raw checkpoint evidence required')
    if cp.get('image_sha256') and hashlib.sha256(raw).hexdigest()!=cp['image_sha256']:raise ValueError('Raw source hash mismatch')
    image=Image.open(path).convert('RGB')
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    depth_id='depth-anything/Depth-Anything-V2-Small-hf';detector_id='google/owlvit-base-patch32'
    api=HfApi()
    dr=args.depth_revision or api.model_info(depth_id).sha
    odr=args.detector_revision or api.model_info(detector_id).sha
    started=time.perf_counter()
    depth_processor=AutoImageProcessor.from_pretrained(depth_id,revision=dr,cache_dir=args.cache)
    depth_model=AutoModelForDepthEstimation.from_pretrained(depth_id,revision=dr,cache_dir=args.cache).eval().to('cpu')
    assert all(t.device.type=='cpu' for t in depth_model.parameters())
    with torch.inference_mode():
        prediction=depth_model(**depth_processor(images=image,return_tensors='pt')).predicted_depth
        prediction=torch.nn.functional.interpolate(prediction.unsqueeze(1),size=(image.height,image.width),mode='bicubic',align_corners=False)[0,0].numpy()
    # Relative inverse depth: larger model prediction denotes nearer content.
    # Percentile ranking is scoped to THIS image; no meters / global map scale.
    sorted_depth=np.sort(prediction.ravel())
    rank=1-np.searchsorted(sorted_depth,prediction,side='right')/len(sorted_depth)
    np.save(output/'relative-depth.npy',rank.astype(np.float32))
    Image.fromarray((np.clip(rank,0,1)*255).astype(np.uint8)).save(output/'relative-depth.png')
    del depth_model
    processor=OwlViTProcessor.from_pretrained(detector_id,revision=odr,cache_dir=args.cache)
    detector=OwlViTForObjectDetection.from_pretrained(detector_id,revision=odr,cache_dir=args.cache).eval().to('cpu')
    assert all(t.device.type=='cpu' for t in detector.parameters())
    labels=['a building','a wall','a vehicle','a fallen tree','debris','a flooded area','a walking path']
    with torch.inference_mode():
        results=detector(**processor(text=[labels],images=image,return_tensors='pt'))
        detections=processor.post_process_grounded_object_detection(results,target_sizes=torch.tensor([[image.height,image.width]]),threshold=.12)[0]
    observations=[]
    for box,score,label in zip(detections['boxes'],detections['scores'],detections['labels']):
        x0,y0,x1,y1=box.tolist();x0=max(0,min(image.width,x0));x1=max(x0,min(image.width,x1));y0=max(0,min(image.height,y0));y1=max(y0,min(image.height,y1))
        region=rank[int(y0):max(int(y0)+1,int(y1)),int(x0):max(int(x0)+1,int(x1))]
        if region.size==0:continue
        observations.append({'observation_id':uuid.uuid4().hex,'source_checkpoint_id':cp['checkpoint_id'],'source_image_sha256':hashlib.sha256(raw).hexdigest(),'label':labels[int(label)],'bbox_normalized':[x0/image.width,y0/image.height,x1/image.width,y1/image.height],'direction':{'screen_x':(x0+x1)/image.width-1,'screen_y':(y0+y1)/image.height-1,'bearing_rad':None},'relative_depth':{'value':float(np.median(region)),'units':'within_image_rank','near_is':'lower','scale_scope':'checkpoint','confidence':None},'estimated_navigation':cp['navigation'],'estimated_position':None,'detection_score':float(score),'review_status':'unreviewed','limitations':['AI-inferred box; may be false positive','No calibrated meters or obstacle map','Path and water boxes are not segmentation or traversability evidence']})
    report={'status':'ready','api_status':'proposal_not_activated','device':'cpu','model_parameters_on_cpu':True,'process_cuda_allocated_bytes':torch.cuda.memory_allocated(),'source_checkpoint_id':cp['checkpoint_id'],'source_image_sha256':hashlib.sha256(raw).hexdigest(),'models':{'depth':{'id':depth_id,'revision':dr},'detector':{'id':detector_id,'revision':odr}},'latency_including_load_seconds':time.perf_counter()-started,'observations':observations}
    (output/'observations.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'observations':len(observations),'latency_seconds':report['latency_including_load_seconds'],'device':'cpu'}))

if __name__=='__main__':main()
