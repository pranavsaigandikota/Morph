"""CPU-only semantic diagnostic on occasional OFFLINE frames; not a recovery trigger."""
import argparse,json,time
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--cache',required=True);p.add_argument('--gpu-tests-ended',action='store_true');a=p.parse_args()
    if not a.gpu_tests_ended:raise SystemExit('Run only after GPU matrix ends')
    import torch
    from transformers import CLIPModel,CLIPProcessor
    torch.set_num_threads(2);torch.set_num_interop_threads(1)
    manifest=json.loads((Path(a.cache)/'model_manifest.json').read_text());started=time.perf_counter()
    model=CLIPModel.from_pretrained(manifest['snapshot'],local_files_only=True).to('cpu').eval();processor=CLIPProcessor.from_pretrained(manifest['snapshot'],local_files_only=True)
    assert all(p.device.type=='cpu' for p in model.parameters())
    texts=['A realistic Florida neighborhood after a hurricane with recognizable houses, roads, palms and debris','A realistic residential street with recognizable buildings, a clear roadway and natural perspective','An indistinct scene of blurry melted objects and meaningless amorphous shapes','A recognizable road with buildings, windows, roofs and trees','A medieval castle','An underwater laboratory','An alien planet','A neon cyberpunk street']
    with torch.inference_mode():
        f=model.get_text_features(**processor(text=texts,return_tensors='pt',padding=True,truncation=True));f=f if isinstance(f,torch.Tensor) else f.pooler_output;f=f/f.norm(dim=-1,keepdim=True)
    load=time.perf_counter()-started;rows=[]
    for report in sorted(Path(a.root).glob('recovery-*/report.json')):
        r=json.loads(report.read_text());samples=r['samples'];selected=set()
        for t in range(0,61,5):selected.add(min(range(len(samples)),key=lambda i:abs(samples[i]['t']-t)))
        for i in range(1,len(samples)):
            if samples[i]['epoch']!=samples[i-1]['epoch']:selected.update((i-1,i))
        for i in sorted(selected):
            sample=samples[i];image=Image.open(report.parent/sample['file']).convert('RGB');start=time.perf_counter()
            with torch.inference_mode():
                v=model.get_image_features(**processor(images=image,return_tensors='pt'));v=v if isinstance(v,torch.Tensor) else v.pooler_output;v=v/v.norm(dim=-1,keepdim=True);scores=(v@f.T)[0].tolist()
            rows.append({'run':r['id'],'profile':r['profile'],'mode':r['mode'],**sample,'cpu_inference_ms':(time.perf_counter()-start)*1000,'theme_similarity':scores[0],'structure_similarity':scores[1],'blob_similarity':scores[2],'structure_minus_blob':scores[1]-scores[2],'cosines':scores})
    controls=[]
    for label,path in [('human-approved SDXL',Path(a.root)/'candidates'/'candidate-1.png'),('human-rejected Waypoint',Path(a.root).parent/'world-memory'/'early-anchor-review.png')]:
        if not path.exists():continue
        with torch.inference_mode():
            v=model.get_image_features(**processor(images=Image.open(path).convert('RGB'),return_tensors='pt'));v=v if isinstance(v,torch.Tensor) else v.pooler_output;v=v/v.norm(dim=-1,keepdim=True);scores=(v@f.T)[0].tolist()
        controls.append({'review':label,'file':str(path),'theme_similarity':scores[0],'structure_similarity':scores[1],'blob_similarity':scores[2],'structure_minus_blob':scores[1]-scores[2],'cosines':scores})
    out={'model':manifest['model'],'revision':manifest['revision'],'device':'cpu','cuda_allocated_bytes':torch.cuda.memory_allocated(),'load_seconds':load,'cpu_inference_p50_ms':float(np.median([x['cpu_inference_ms'] for x in rows])),'cpu_inference_p95_ms':float(np.percentile([x['cpu_inference_ms'] for x in rows],95)),'texts':texts,'rows':rows,'human_review_controls':controls,'limitations':['Offline inference, no concurrent load during measured GPU sessions','Similarity is not probability, scene coherence, geometry or safe path verification','No automatic recovery threshold calibrated or activated; human review required']}
    (Path(a.root)/'comparison'/'semantic-diagnostic.json').write_text(json.dumps(out,indent=2));print(json.dumps({k:v for k,v in out.items() if k!='rows'},indent=2))

if __name__=='__main__':main()
