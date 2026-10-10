"""Optional local SDXL image generator. No changes to the Waypoint backend."""
import gc
import os
from pathlib import Path
import ssl
import time

MODEL = "stabilityai/stable-diffusion-xl-base-1.0"
REVISION = "462165984030d82259a11f4367a4eed129e94a7b"
ROOT = Path(__file__).resolve().parents[1]
PATTERNS = ["model_index.json", "scheduler/*", "tokenizer/*", "tokenizer_2/*",
            "text_encoder/config.json", "text_encoder/model.fp16.safetensors",
            "text_encoder_2/config.json", "text_encoder_2/model.fp16.safetensors",
            "unet/config.json", "unet/diffusion_pytorch_model.fp16.safetensors",
            "vae/config.json", "vae/diffusion_pytorch_model.fp16.safetensors", "LICENSE.md", "README.md"]


def download():
    # Verified Windows system trust, never disable certificate checks. Keep cache local.
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")
    import httpx
    from huggingface_hub import set_client_factory, snapshot_download
    set_client_factory(lambda: httpx.Client(verify=ssl.create_default_context(), follow_redirects=True))
    return snapshot_download(MODEL, revision=REVISION, cache_dir=str(ROOT / "models" / "hf"),
                             allow_patterns=PATTERNS, max_workers=2)


class SceneBackend:
    def __init__(self, progress):
        import torch
        from diffusers import StableDiffusionXLPipeline
        progress("downloading_image_model", 0, 4)
        path = download()
        progress("loading_image_model", 0, 4)
        self.pipe = StableDiffusionXLPipeline.from_pretrained(path, torch_dtype=torch.float16,
                     variant="fp16", use_safetensors=True, local_files_only=True, add_watermarker=False)
        # Do not move the entire pipeline to CUDA. Keep inactive components in RAM.
        self.pipe.enable_model_cpu_offload(gpu_id=0)
        self.pipe.vae.enable_tiling()
        self.pipe.set_progress_bar_config(disable=True)

    def generate(self, prompt, seed, steps, progress, style=None):
        import torch
        from PIL import ImageOps, Image
        effective = "First-person eye-level view, " + prompt
        if style:
            effective += ", visual style: " + style
        for tokenizer in (self.pipe.tokenizer, self.pipe.tokenizer_2):
            if len(tokenizer(effective, truncation=False).input_ids) > tokenizer.model_max_length:
                raise ValueError("Description plus first-person prefix exceeds SDXL's 77-token limit; shorten the description")
        started = time.perf_counter()
        torch.cuda.reset_peak_memory_stats()
        def step(pipe, index, timestep, kwargs):
            progress("denoising", index+1, steps)
            return kwargs
        try:
            progress("encoding_prompt", 0, steps)
            image = self.pipe(prompt=effective, height=720, width=1280, num_inference_steps=steps,
                guidance_scale=5.0, generator=torch.Generator(device="cpu").manual_seed(seed),
                callback_on_step_end=step).images[0]
            torch.cuda.synchronize()
            stats = {"generation_seconds": time.perf_counter()-started,
                     "image_process_peak_allocated_mb": torch.cuda.max_memory_allocated()/2**20,
                     "image_process_peak_reserved_mb": torch.cuda.max_memory_reserved()/2**20}
            image = ImageOps.fit(image.convert("RGB"), (1280, 720), method=Image.Resampling.LANCZOS)
            return image, effective, stats
        finally:
            # Accelerate hooks offload the last component; retain CPU weights for reuse.
            self.pipe.maybe_free_model_hooks()
            gc.collect()
            torch.cuda.empty_cache()

    def close(self):
        self.pipe.maybe_free_model_hooks()
        del self.pipe
        gc.collect()
