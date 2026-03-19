"""RAG chain: retrieve context + generate response (streaming & non-streaming)."""
from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncGenerator

import httpx

from .retriever import Retriever

logger = logging.getLogger(__name__)


_LLM_API_KEY = os.getenv("LLM_API_KEY", "")
_LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")  # "anthropic" or "openai"
_LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "https://api.anthropic.com" if _LLM_PROVIDER == "anthropic" else "https://api.openai.com/v1",
)
_LLM_MODEL = os.getenv(
    "LLM_MODEL",
    "claude-haiku-4-5-20251001" if _LLM_PROVIDER == "anthropic" else "gpt-4.1-nano",
)


def is_llm_configured() -> bool:
    """Return True if an LLM API key is set."""
    return bool(_LLM_API_KEY)


def _build_prompt(query: str, context_chunks: list[str]) -> str:
    context = "\n\n".join(context_chunks)
    return f"""You are CogniLight AI, an assistant analyzing smart street lighting telemetry data.
Answer the user's question based on the telemetry context below. Be concise and data-driven.
If the data doesn't contain relevant information, say so.
Format your response using markdown for readability (bold for emphasis, bullet lists, tables when appropriate).

Use your knowledge of each pole's surroundings to explain patterns. For example, low
pedestrian counts near an office at night are expected, but a crowd near a school at
midnight is anomalous. Reference the zone type when it helps explain the data.

--- POLE ZONE REFERENCE ---
POLE-01: Office district — busy 8-18h, dead at night
POLE-02: Retail strip — busy 10-20h, quiet overnight
POLE-03: Park — morning/evening pedestrian & cyclist peaks, empty at night
POLE-04: School zone — sharp peaks at 7:30-8:30 and 15-16h (drop-off/pickup), empty nights
POLE-05: Mall area — busy 10-21h, moderate evening, quiet overnight
POLE-06: Apartment complex — morning/evening rush, low daytime, some overnight
POLE-07: Gym — early morning (6-8h) and after-work (17-21h) peaks
POLE-08: Residential — morning/evening commute peaks, quiet during work hours
POLE-09: Cafe district — morning coffee rush (7-10h), lunch peak (12-14h), quiet at night
POLE-10: Mixed-use area — moderate activity throughout the day
POLE-11: Office tower — high vehicle traffic during commute, busy work hours, dead at night
POLE-12: Hotel — steady activity all day, moderate overnight presence
--- END REFERENCE ---

--- TELEMETRY CONTEXT ---
{context}
--- END CONTEXT ---

User question: {query}"""


# ---------------------------------------------------------------------------
# Non-streaming (kept for backward compat)
# ---------------------------------------------------------------------------

async def generate_response(
    query: str,
    retriever: Retriever,
    top_k: int = 5,
) -> tuple[str, list[str]]:
    """Generate a RAG response. Returns (reply, source_texts)."""
    logger.info("Chat query: %s", query)
    chunks = retriever.search(query, top_k=top_k)
    source_texts = [c.text for c in chunks]
    logger.info("Retrieved %d chunks", len(source_texts))

    if not source_texts:
        logger.warning("No chunks available — returning empty-data message")
        return (
            "I don't have enough telemetry data yet to answer that question. "
            "Please wait for the simulation to generate more data.",
            [],
        )

    if not _LLM_API_KEY:
        logger.error("No API key configured")
        return "LLM API key is not configured. Set LLM_API_KEY in your .env file.", []

    logger.info("Calling %s provider (model=%s)", _LLM_PROVIDER, _LLM_MODEL)
    prompt = _build_prompt(query, source_texts)
    try:
        if _LLM_PROVIDER == "anthropic":
            reply = await _call_anthropic(prompt)
        else:
            reply = await _call_openai(prompt)
        logger.info("LLM response length: %d chars", len(reply))
        return reply, source_texts
    except Exception as e:
        logger.exception("LLM call failed")
        return f"Error calling LLM: {e}", source_texts


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

async def generate_response_stream(
    query: str,
    retriever: Retriever,
    top_k: int = 5,
) -> AsyncGenerator[dict, None]:
    """Stream a RAG response as SSE events.

    Yields dicts with ``event`` and ``data`` keys:
    - ``{"event": "sources", "data": {"sources": [...]}}``
    - ``{"event": "token",   "data": {"text": "..."}}``
    - ``{"event": "done",    "data": {}}``
    """
    logger.info("Stream chat query: %s", query)
    chunks = retriever.search(query, top_k=top_k)
    logger.info("Retrieved %d chunks", len(chunks))

    if not chunks:
        logger.warning("No chunks available")
        yield {"event": "token", "data": {"text": (
            "I don't have enough telemetry data yet to answer that question. "
            "Please wait for the simulation to generate more data."
        )}}
        yield {"event": "done", "data": {}}
        return

    # Emit structured sources
    structured_sources = [
        {"text": c.text, "timestamp": c.timestamp, "poleIds": c.pole_ids}
        for c in chunks
    ]
    yield {"event": "sources", "data": {"sources": structured_sources}}

    source_texts = [c.text for c in chunks]

    if not _LLM_API_KEY:
        logger.error("No API key configured")
        yield {"event": "token", "data": {"text": "LLM API key is not configured. Set LLM_API_KEY in your .env file."}}
        yield {"event": "done", "data": {}}
        return

    logger.info("Streaming from %s (model=%s)", _LLM_PROVIDER, _LLM_MODEL)
    prompt = _build_prompt(query, source_texts)
    try:
        if _LLM_PROVIDER == "anthropic":
            stream_fn = _stream_anthropic
        else:
            stream_fn = _stream_openai
        async for text in stream_fn(prompt):
            yield {"event": "token", "data": {"text": text}}
    except Exception as e:
        logger.exception("LLM stream failed")
        yield {"event": "token", "data": {"text": f"\n\nError calling LLM: {e}"}}

    yield {"event": "done", "data": {}}


# ---------------------------------------------------------------------------
# Provider calls — non-streaming
# ---------------------------------------------------------------------------

async def _call_anthropic(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_LLM_BASE_URL}/v1/messages",
            headers={
                "x-api-key": _LLM_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": _LLM_MODEL,
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


async def _call_openai(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {_LLM_API_KEY}"},
            json={
                "model": _LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# Provider calls — streaming
# ---------------------------------------------------------------------------

async def _stream_anthropic(prompt: str) -> AsyncGenerator[str, None]:
    """Stream tokens from the Anthropic Messages API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{_LLM_BASE_URL}/v1/messages",
            headers={
                "x-api-key": _LLM_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": _LLM_MODEL,
                "max_tokens": 500,
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


async def _stream_openai(prompt: str) -> AsyncGenerator[str, None]:
    """Stream tokens from an OpenAI-compatible chat completions API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{_LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {_LLM_API_KEY}"},
            json={
                "model": _LLM_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 500,
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
