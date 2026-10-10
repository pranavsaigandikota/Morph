"""Standalone diagnosis of SDXL img2img memory/time at 1280x720 (CPU offload variants). No server changes."""
import sys, time, gc
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import torch
from PIL import Image
from worldshift.scenes_backend import SceneBackend

src = Image.open(sys.argv[1]).convert('RGB')
mode = sys.argv[2] if len(sys.argv) > 2 else 'model'
base = SceneBackend(lambda *a: None)
print('base unet dtype', base.pipe.unet.dtype, 'device', base.pipe.unet.device)
from diffusers import StableDiffusionXLImg2ImgPipeline
img2img = StableDiffusionXLImg2ImgPipeline(**base.pipe.components)
print('img2img unet dtype', img2img.unet.dtype, 'device', img2img.unet.device)
if mode == 'model':
    img2img.enable_model_cpu_offload(gpu_id=0)
elif mode == 'sequential':
    img2img.enable_sequential_cpu_offload(gpu_id=0)
img2img.vae.enable_tiling()
img2img.set_progress_bar_config(disable=True)
seen = {}
def step(p, i, t, kw):
    seen[i] = (time.perf_counter(), torch.cuda.memory_allocated() / 2**20)
    return kw
torch.cuda.reset_peak_memory_stats(); t0 = time.perf_counter()
out = img2img(prompt='First-person eye-level view, Florida street after a hurricane, sharp focus', image=src.resize((1280, 720)),
              strength=0.35, num_inference_steps=30, guidance_scale=5.0, callback_on_step_end=step,
              generator=torch.Generator('cpu').manual_seed(1)).images[0]
torch.cuda.synchronize(); t1 = time.perf_counter()
steps = sorted(seen.items())
print(f'mode={mode} total={t1-t0:.1f}s steps={len(steps)} first_step_at={steps[0][1][0]-t0:.1f}s '
      f'step_time={(steps[-1][1][0]-steps[0][1][0])/max(1,len(steps)-1):.2f}s peak_reserved={torch.cuda.max_memory_reserved()/2**20:.0f}MiB '
      f'peak_alloc={torch.cuda.max_memory_allocated()/2**20:.0f}MiB')
out.save(Path(sys.argv[1]).with_name(f'diag-{mode}.png'))
