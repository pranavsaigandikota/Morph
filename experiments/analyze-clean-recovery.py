"""Post-run analysis/real sampled comparison video. Never starts GPU inference."""
import argparse
import csv
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont

def percentile(v,p):return float(np.percentile(v,p)) if v else None
def main():
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--backend',required=True);p.add_argument('--ffmpeg-python-path',required=True);a=p.parse_args()
    root=Path(a.root);backend=Path(a.backend);dest=root/'comparison';dest.mkdir(exist_ok=True)
    sys.path.insert(0,a.ffmpeg_python_path);import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();summaries=[];videos=[];panes=[]
    font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',20)
    reports=sorted(root.glob('recovery-*/report.json'),key=lambda q:(int(json.loads(q.read_text())['profile']),json.loads(q.read_text())['mode']))
    for report in reports:
        r=json.loads(report.read_text());folder=report.parent
        rows=[json.loads(line) for sid in r['sessions'] for line in (backend/'results'/sid/'batches.jsonl').read_text().splitlines()]
        # Start before first measured sample is known by its frame_id/batch timestamp.
        first_id=r['samples'][0]['frame_id'];first_batch=(first_id-1)//4
        rows=[x for x in rows if first_batch<=x['batch_id']<r['final_metrics']['generated_frames']//4]
        s={'id':r['id'],'profile':r['profile'],'mode':r['mode'],'seconds':r['seconds'],'generated_frames':sum(x['frames'] for x in rows),'generated_fps':sum(x['frames'] for x in rows)/r['seconds'],'received_fps':r['received']/r['seconds'],'canvas_fps':r['displayed']/r['seconds'],'presentation_skips':r['presentation_skips'],'frame_gaps':r['gaps'],'stale_frames':r['stale_frames'],'decode_errors':r['decode_errors'],'protocol_errors':r['protocol_errors'],'errors':r['errors'],'server_drop_counter':r['final_metrics']['dropped_frames'],'ack_p50_ms':percentile(r['ack_ms'],50),'ack_p95_ms':percentile(r['ack_ms'],95),'control_to_draw_p50_ms':percentile(r['control_to_draw_ms'],50),'control_to_draw_p95_ms':percentile(r['control_to_draw_ms'],95),'batch_p50_ms':percentile([x['batch_latency_ms'] for x in rows],50),'batch_p95_ms':percentile([x['batch_latency_ms'] for x in rows],95),'vram_reserved_mb':max(x['vram_mb'] for x in rows),'process_peak_reserved_mb':max(x['peak_reserved_mb'] for x in rows),'transitions':r['transitions'],'model_load_count':r['health']['model_load_count'],'visibility':sorted(set(x['state'] for x in r['visibility']))}
        summaries.append(s)
        s.update({'decode_p50_ms':percentile(r['decode_ms'],50),'decode_p95_ms':percentile(r['decode_ms'],95),'inference_p50_ms':percentile([x['inference_ms'] for x in rows],50),'encoding_p50_ms':percentile([x['encoding_ms'] for x in rows],50),'transfer_p50_ms':percentile([x['transfer_ms'] for x in rows],50),'warmup_ms':r['warmup_ms']})
        samples=[x for x in r['samples'] if (folder/x['file']).exists()]
        tile=Image.new('RGB',(1600,210),(14,20,28));d=ImageDraw.Draw(tile)
        for i,t in enumerate((0,15,30,45,60)):
            closest=min(samples,key=lambda x:abs(x['t']-t));im=Image.open(folder/closest['file']).convert('RGB').resize((320,180));tile.paste(im,(i*320,30));d.text((i*320+4,4),f"{r['profile']} {r['mode']} t={closest['t']:.1f}s",font=font,fill='white')
        panes.append(tile)
        concat=dest/(r['id']+'.ffconcat');lines=['ffconcat version 1.0']
        for i,sample in enumerate(samples):
            duration=(samples[i+1]['t'] if i+1<len(samples) else r['seconds'])-sample['t']
            lines.extend(["file '"+(folder/sample['file']).as_posix()+"'",f'duration {max(.001,duration):.6f}'])
        lines.append("file '"+(folder/samples[-1]['file']).as_posix()+"'");concat.write_text('\n'.join(lines)+'\n')
        video=dest/(r['id']+'-real-samples.mp4')
        subprocess.run([ffmpeg,'-y','-loglevel','error','-safe','0','-i',str(concat),'-vf','scale=640:360,fps=5','-t','60','-c:v','libx264','-preset','fast','-crf','19',str(video)],check=True)
        videos.append((r,video))
    sheet=Image.new('RGB',(1600,len(panes)*210),(10,15,20))
    for i,tile in enumerate(panes):sheet.paste(tile,(0,i*210))
    sheet.save(dest/'contact-sheet.jpg',quality=95)
    (dest/'summary.json').write_text(json.dumps(summaries,indent=2))
    # Only compose the exact6 successful matrix runs; no substituted/mocked panes.
    if len(videos)==6:
        args=[ffmpeg,'-y','-loglevel','error'];filters=[]
        for i,(r,video) in enumerate(videos):
            args+=['-i',str(video)];label=f"{r['profile']}P {r['mode']} | real sampled JPEGs"
            filters.append(f"[{i}:v]pad=640:390:0:30:black,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='{label}':x=8:y=5:fontsize=18:fontcolor=white[v{i}]")
        filters.append(''.join(f'[v{i}]' for i in range(6))+'xstack=inputs=6:layout=0_0|640_0|1280_0|0_390|640_390|1280_390[out]')
        args+=['-filter_complex',';'.join(filters),'-map','[out]','-t','60','-c:v','libx264','-preset','fast','-crf','19',str(dest/'side-by-side-360-720.mp4')]
        subprocess.run(args,check=True)
    print(json.dumps(summaries,indent=2))

if __name__=='__main__':main()
