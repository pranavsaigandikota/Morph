"""CPU analysis only: phase correlation is image motion, not a camera yaw sensor."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

def gray(path):return np.asarray(Image.open(path).convert('L').resize((160,90)),dtype=np.float32)
def pan(a,b):
    # Central strip, zero-mean and Hann window; returns movement of b relative to a.
    a=a[25:65,:];b=b[25:65,:];window=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]))
    fa=np.fft.fft2((a-a.mean())*window);fb=np.fft.fft2((b-b.mean())*window)
    cross=fb*fa.conj();corr=np.fft.ifft2(cross/(np.abs(cross)+1e-9)).real
    y,x=np.unravel_index(np.argmax(corr),corr.shape);x=x if x<=80 else x-160;y=y if y<=20 else y-40
    score=float(corr.max()/(np.sqrt(np.mean(corr*corr))+1e-9))
    return float(x),float(y),score
def main():
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);a=p.parse_args();root=Path(a.root);m=json.loads((root/'manifest.json').read_text());result=[]
    # Code validation only: synthetic translation must not be mistaken for GPU evidence.
    rng=np.random.default_rng(7);synthetic=rng.normal(size=(90,160));dx,_,_=pan(synthetic,np.roll(synthetic,5,axis=1));assert dx==5
    font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',16)
    for run in m['runs']:
        folder=root/run['folder'];rows=[json.loads(s) for s in (folder/'batches.jsonl').read_text().splitlines()];previous=gray(folder/'seed.png');ind=[]
        for row in rows:
            path=folder/row['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'];g=gray(path);dx,dy,confidence=pan(previous,g)
            lap=g[1:-1,2:]+g[1:-1,:-2]+g[2:,1:-1]+g[:-2,1:-1]-4*g[1:-1,1:-1]
            ind.append({'evidence':'INFERRED','batch':row['batch'],'phase':row['phase'],'horizontal_pan_px_at160':dx,'vertical_pan_px_at90':dy,'phase_peak_to_rms':confidence,'mean_abs_change':float(np.mean(np.abs(g-previous))/255),'laplacian_variance':float(lap.var()),'luma_std':float(g.std())});previous=g
        tile=Image.new('RGB',(1280,205),(12,20,28));draw=ImageDraw.Draw(tile)
        for i,batch in enumerate((0,1,3,5,10,14)):
            file='seed.png' if not batch else f'batch-{batch:02}.jpg';im=Image.open(folder/file).convert('RGB').resize((213,120));tile.paste(im,(i*213,30));draw.text((i*213+4,5),f'S{run["scene"]} m{run["magnitude"]:g} b{batch}',font=font,fill='white')
        draw.text((4,160),'Human angle / recognizable / smearing review PENDING. Image pan is not degrees.',font=font,fill='white');tile.save(folder/'contact-sheet.jpg',quality=95)
        result.append({**run,'turn_integrated_pan_px_at160':sum(x['horizontal_pan_px_at160'] for x in ind[:10]),'indicators':ind,'human_angle_bucket':None,'human_quality_approved':None})
    (root/'analysis.json').write_text(json.dumps({'results':result,'synthetic_code_test':'+5px phase-correlation sign PASS; not GPU evidence','limitations':['No measured FOV or yaw; pans include hallucination, deformation and perspective','Sharpness and small changes do not prove recognizable architecture','Gain config remains unset pending human angle/quality review']},indent=2))
    for scene in range(1,4):
        sheets=[Image.open(root/x['folder']/'contact-sheet.jpg') for x in result if x['scene']==scene];page=Image.new('RGB',(1280,205*len(sheets)),(12,20,28))
        for i,sheet in enumerate(sheets):page.paste(sheet,(0,i*205))
        page.save(root/f'scene-{scene}-probe-sheet.jpg',quality=95)

if __name__=='__main__':main()
