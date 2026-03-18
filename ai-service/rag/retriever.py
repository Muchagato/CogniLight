"""FAISS-based vector retriever for telemetry summaries."""
from __future__ import annotations

from dataclasses import dataclass, field

import faiss
import numpy as np

from .embeddings import embed_texts, embed_query


@dataclass
class Chunk:
    text: str
    timestamp: str
    pole_ids: list[str] = field(default_factory=list)


class Retriever:
    def __init__(self, dim: int = 384):
        self.index = faiss.IndexFlatIP(dim)  # Inner product on normalized vectors
        self.chunks: list[Chunk] = []

    def add_chunks(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        texts = [c.text for c in chunks]
        vectors = embed_texts(texts)
        self.index.add(vectors)
        self.chunks.extend(chunks)

    def search(self, query: str, top_k: int = 5) -> list[Chunk]:
        if self.index.ntotal == 0:
            return []
        q_vec = embed_query(query).reshape(1, -1)
        k = min(top_k, self.index.ntotal)
        _, indices = self.index.search(q_vec, k)
        return [self.chunks[i] for i in indices[0] if i < len(self.chunks)]

    @property
    def size(self) -> int:
        return self.index.ntotal
