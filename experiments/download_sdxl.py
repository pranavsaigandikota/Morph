"""Download only pinned FP16 SDXL components; no GPU allocation."""
from backend.worldshift.scenes_backend import download
print(download(), flush=True)
