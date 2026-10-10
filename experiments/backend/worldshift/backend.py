"""All methods run on one persistent GPU thread. Never return device buffers."""
import io
import os
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from world_engine import CtrlInput, WorldEngine

from .protocol import BUTTONS

MODEL = 'Overworld/Waypoint-1.5-1B'
if os.environ.get('WORLDSHIFT_EXPERIMENT_MODEL', MODEL) != MODEL:
    raise ValueError('This visual experience supports native 1280x720 Waypoint only')


class Backend:
    def __init__(self):
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA unavailable; no substitute backend is permitted")
        started = time.perf_counter()
        self.engine = WorldEngine(MODEL, quant="fp8w8a8", device="cuda", load_weights=True)
        self.prompt_supported = self.engine.model_cfg.prompt_conditioning is not None
        self.height, self.width = map(int, self.engine.vae._img_size)
        self.seed_count = int(self.engine.model_cfg.temporal_compression)
        torch.cuda.synchronize()
        self.load_seconds = time.perf_counter() - started
        self.seed_frames = None

    def initialize(self, path: Path, prompt: str):
        with Image.open(path) as image:
            image = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGB"),
                                 (self.width, self.height), method=Image.Resampling.LANCZOS)
            self.seed_frames = torch.from_numpy(np.repeat(np.asarray(image)[None], self.seed_count, axis=0).copy())
        self.reinitialize(prompt)

    def reinitialize(self, prompt: str):
        if self.seed_frames is None:
            raise RuntimeError("No session seed is initialized")
        self.engine.reset()
        if self.prompt_supported:
            self.engine.set_prompt(prompt)
        self.engine.append_frame(self.seed_frames)
        torch.cuda.synchronize()

    def restore_anchor(self, path: Path, prompt: str):
        original = self.seed_frames
        try:
            self.initialize(path, prompt)
        finally:
            # /world/reset must continue to restore the world's ORIGINAL seed.
            self.seed_frames = original

    def generate(self, keys, mouse):
        started = time.perf_counter()
        output = self.engine.gen_frame(CtrlInput(button={BUTTONS[k] for k in keys}, mouse=mouse))
        torch.cuda.synchronize()
        generated_at = time.perf_counter() * 1000
        inference_ms = generated_at - started * 1000
        # One transfer for the entire batch, before another call can reuse CUDA buffers.
        frames = output.cpu().numpy()
        torch.cuda.synchronize()
        transfer_ms = time.perf_counter() * 1000 - generated_at
        if frames.dtype != np.uint8 or frames.shape[1:] != (self.height, self.width, 3):
            raise RuntimeError(f"Unexpected real decoded output: {frames.shape}, {frames.dtype}")
        return frames, generated_at, inference_ms, transfer_ms, self.memory()

    def memory(self):
        return {"vram_mb": torch.cuda.memory_reserved()/2**20,
                "allocated_mb": torch.cuda.memory_allocated()/2**20,
                "peak_reserved_mb": torch.cuda.max_memory_reserved()/2**20,
                "peak_allocated_mb": torch.cuda.max_memory_allocated()/2**20}

    def reset(self):
        self.engine.reset()
        self.seed_frames = None
        torch.cuda.synchronize()


def encode(frames):
    started = time.perf_counter()
    result = []
    for frame in frames:
        buffer = io.BytesIO()
        Image.fromarray(frame).save(buffer, format="JPEG", quality=85, subsampling=0)
        result.append(buffer.getvalue())
    return result, (time.perf_counter() - started) * 1000
