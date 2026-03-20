"""RAG chain: retrieve context + generate response (streaming & non-streaming)."""
from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field

import httpx
from sqlalchemy.engine import Engine

from constants import POLE_ZONE_DESCRIPTIONS
from .retriever import Retriever
from .sql_context import build_sql_context

logger = logging.getLogger(__name__)


MAX_LLM_TOKENS = 2048

# ---------------------------------------------------------------------------
# Per-request LLM configuration (BYOK)
# ---------------------------------------------------------------------------

@dataclass
class LLMConfig:
    """Per-request LLM configuration sent by the client."""
    api_key: str = ""
    provider: str = "anthropic"
    model: str = ""
    base_url: str = ""

    @property
    def effective_model(self) -> str:
        if self.model:
            return self.model
        return "claude-haiku-4-5-20251001" if self.provider == "anthropic" else "gpt-4.1-nano"

    @property
    def effective_base_url(self) -> str:
        if self.base_url:
            return self.base_url
        return "https://api.anthropic.com" if self.provider == "anthropic" else "https://api.openai.com/v1"


# ---------------------------------------------------------------------------
# Query classification
# ---------------------------------------------------------------------------

_SQL_ONLY_KEYWORDS = re.compile(
    r"^(?:what time|current time|how many poles|list poles|pole count)\b",
    re.I,
)


def _needs_rag(query: str) -> bool:
    """Decide whether the query benefits from incident log RAG context.

    Default to including RAG — incident logs explain *why* anomalies and
    patterns appear in the telemetry.  Only skip for narrow factual lookups
    that clearly don't need narrative context.
    """
    return not bool(_SQL_ONLY_KEYWORDS.search(query))


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(query: str, sql_context: str, rag_narratives: list[str] | None) -> str:
    sections: list[str] = []
    sections.append(
        "You are CogniLight AI, an assistant analyzing smart street lighting telemetry data.\n"
        "Answer the user's question based on the context below. Be concise and data-driven.\n"
        "If the data doesn't contain relevant information, say so.\n"
        "Format your response using markdown for readability (bold for emphasis, bullet lists, "
        "tables when appropriate).\n\n"
        "Use your knowledge of each pole's surroundings to explain patterns. For example, low\n"
        "pedestrian counts near an office at night are expected, but a crowd near a school at\n"
        "midnight is anomalous. Reference the zone type when it helps explain the data."
    )

    zone_lines = "\n".join(f"{pid}: {desc}" for pid, desc in POLE_ZONE_DESCRIPTIONS.items())
    sections.append(f"--- POLE ZONE REFERENCE ---\n{zone_lines}\n--- END REFERENCE ---")

    sections.append(sql_context)

    if rag_narratives:
        sections.append(
            "--- MAINTENANCE & INCIDENT LOGS ---\n"
            "These are free-text reports from technicians, automated diagnostics, and control room operators.\n\n"
            + "\n\n".join(rag_narratives)
            + "\n--- END LOGS ---"
        )

    sections.append(f"User question: {query}")
    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

async def generate_response_stream(
    query: str,
    retriever: Retriever,
    engine: Engine,
    *,
    llm_config: LLMConfig | None = None,
    top_k: int = 5,
) -> AsyncGenerator[dict, None]:
    """Stream a hybrid SQL+RAG response as SSE events."""
    logger.info("Stream chat query: %s", query)
    cfg = llm_config or LLMConfig()

    sql_result = build_sql_context(engine)

    rag_narratives: list[str] | None = None
    rag_chunks = []
    if _needs_rag(query):
        rag_chunks = retriever.search(query, top_k=top_k)
        if rag_chunks:
            rag_narratives = [c.text for c in rag_chunks]
            logger.info("Retrieved %d incident log chunks via RAG", len(rag_narratives))

    yield {
        "event": "sql_context",
        "data": {
            "queries": [
                {
                    "label": q.label,
                    "query": q.query,
                    "rowCount": q.row_count,
                    "columns": q.columns,
                    "rows": q.rows,
                }
                for q in sql_result.queries
            ],
        },
    }

    if rag_chunks:
        structured_sources = [
            {"text": c.text, "timestamp": c.timestamp, "poleIds": c.pole_ids}
            for c in rag_chunks
        ]
        yield {"event": "sources", "data": {"sources": structured_sources}}

    if not cfg.api_key:
        yield {"event": "token", "data": {"text": "No API key provided. Please configure your LLM API key in the chat settings."}}
        yield {"event": "done", "data": {}}
        return

    logger.info("Streaming from %s (model=%s)", cfg.provider, cfg.effective_model)
    prompt = _build_prompt(query, sql_result.text, rag_narratives)
    try:
        if cfg.provider == "anthropic":
            stream_fn = _stream_anthropic
        else:
            stream_fn = _stream_openai
        async for text in stream_fn(prompt, cfg):
            yield {"event": "token", "data": {"text": text}}
    except Exception as e:
        logger.exception("LLM stream failed")
        yield {"event": "token", "data": {"text": f"\n\nError calling LLM: {e}"}}

    yield {"event": "done", "data": {}}


# ---------------------------------------------------------------------------
# Provider calls
# ---------------------------------------------------------------------------

async def _stream_anthropic(prompt: str, cfg: LLMConfig) -> AsyncGenerator[str, None]:
    """Stream tokens from the Anthropic Messages API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{cfg.effective_base_url}/v1/messages",
            headers={
                "x-api-key": cfg.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": cfg.effective_model,
                "max_tokens": MAX_LLM_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if data.get("type") == "content_block_delta":
                    delta = data.get("delta", {})
                    if delta.get("type") == "text_delta":
                        yield delta["text"]
                elif data.get("type") == "message_stop":
                    break


async def _stream_openai(prompt: str, cfg: LLMConfig) -> AsyncGenerator[str, None]:
    """Stream tokens from an OpenAI-compatible chat completions API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{cfg.effective_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {cfg.api_key}"},
            json={
                "model": cfg.effective_model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": MAX_LLM_TOKENS,
                "temperature": 0.3,
                "stream": True,
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                content = data.get("choices", [{}])[0].get("delta", {}).get("content")
                if content:
                    yield content
