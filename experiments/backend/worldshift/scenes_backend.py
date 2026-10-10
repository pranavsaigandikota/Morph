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

    def enhance(self, image, prompt, strength, seed, steps=30):
        """SDXL img2img on a captured Waypoint frame (shared weights, CPU offload). The result is a separate
        presentation/anchor image: it can alter structure and never replaces the raw frame as evidence."""
        import torch
        from diffusers import StableDiffusionXLImg2ImgPipeline
        from PIL import ImageOps, Image
        source = ImageOps.fit(image.convert("RGB"), (1280, 720), method=Image.Resampling.LANCZOS)
        started = time.perf_counter()
        # Waypoint shares this process and its caching allocator. Release cached-but-unused blocks first: with
        # the world loaded, SDXL at 1280x720 otherwise exceeds 16 GB and Windows spills to slow shared memory
        # (measured 410 s, 15040 MiB peak reserved before this change).
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        img2img = StableDiffusionXLImg2ImgPipeline(**self.pipe.components)  # from_pipe upcast the UNet to fp32 (10.8 GB, 42 s/step)
        img2img.set_progress_bar_config(disable=True)
        try:
            img2img.enable_model_cpu_offload(gpu_id=0)
            img2img.vae.enable_tiling()
            img2img.vae.enable_slicing()
            out = img2img(prompt="First-person eye-level view, " + prompt + ", sharp focus, highly detailed, clean",
                          negative_prompt="blurry, smeared, melted, distorted, ghosting, double exposure, low quality",
                          image=source, strength=strength, num_inference_steps=steps, guidance_scale=5.0,
                          generator=torch.Generator(device="cpu").manual_seed(seed)).images[0]
            torch.cuda.synchronize()
            stats = {"enhance_seconds": time.perf_counter() - started,
                     "enhance_peak_reserved_mb": torch.cuda.max_memory_reserved() / 2**20}
            return ImageOps.fit(out.convert("RGB"), (1280, 720), method=Image.Resampling.LANCZOS), stats
        finally:
            img2img.maybe_free_model_hooks()
            del img2img
            # from_pipe shares modules; restore the base pipeline's offload hook chain for scene generation.
            self.pipe.enable_model_cpu_offload(gpu_id=0)
            gc.collect()
            torch.cuda.empty_cache()

    def close(self):
        self.pipe.maybe_free_model_hooks()
        del self.pipe
        gc.collect()
