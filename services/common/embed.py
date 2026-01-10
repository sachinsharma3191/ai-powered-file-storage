import hashlib
import math
from typing import List

DIM = 64


def _bytes_to_vec(b: bytes, dim: int = DIM) -> List[float]:
    out = []
    i = 0
    while len(out) < dim:
        h = hashlib.sha256(b + i.to_bytes(2, "big")).digest()
        out.extend(h)
        i += 1
    out = out[:dim]
    vec = [((x / 255.0) * 2.0 - 1.0) for x in out]
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed_text(text: str) -> List[float]:
    return _bytes_to_vec((text or "").encode("utf-8"))


def embed_bytes(data: bytes) -> List[float]:
    return _bytes_to_vec(data or b"")
