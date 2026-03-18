"""Embedding generation using sentence-transformers."""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from numpy.typing import NDArray

_model = None
_DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
_EMBED_DIM = 384  # all-MiniLM-L6-v2 dimension


def _get_model():
    global _model
    if _model is None:
        if _DEMO_MODE:
            return None
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_texts(texts: list[str]) -> NDArray[np.float32]:
    """Embed a list of texts. Returns (N, dim) float32 array."""
    model = _get_model()
    if model is None:
        # Demo mode: deterministic pseudo-embeddings
        rng = np.random.RandomState(42)
        vecs = np.array([
            rng.randn(_EMBED_DIM).astype(np.float32)
            for _ in texts
        ])
        # Normalize
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        return vecs / np.maximum(norms, 1e-8)
    return model.encode(texts, normalize_embeddings=True)


def embed_query(query: str) -> NDArray[np.float32]:
    """Embed a single query string."""
    return embed_texts([query])[0]
