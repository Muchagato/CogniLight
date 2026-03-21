"""RAG chain: retrieve context + generate response (streaming & non-streaming)."""
from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import httpx
from sqlalchemy.engine import Engine

from constants import POLE_ZONE_DESCRIPTIONS, POLE_ZONES
from .retriever import Retriever
from .sql_context import get_table_schema, execute_queries, format_query_results

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
# Non-streaming LLM calls (for SQL generation)
# ---------------------------------------------------------------------------

async def _call_llm(prompt: str, cfg: LLMConfig) -> str:
    """Make a non-streaming LLM call and return the full response text."""
    if cfg.provider == "anthropic":
        return await _call_anthropic(prompt, cfg)
    return await _call_openai(prompt, cfg)


async def _call_anthropic(prompt: str, cfg: LLMConfig) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{cfg.effective_base_url}/v1/messages",
            headers={
                "x-api-key": cfg.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": cfg.effective_model,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


async def _call_openai(prompt: str, cfg: LLMConfig) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{cfg.effective_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {cfg.api_key}"},
            json={
                "model": cfg.effective_model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1024,
                "temperature": 0.0,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------------------
# SQL query generation
# ---------------------------------------------------------------------------

_ZONE_LIST = "\n".join(f"  {pid}: {zone}" for pid, zone in POLE_ZONES.items())

_QUERY_GEN_PROMPT = """\
You are a SQL query generator for a smart street lighting telemetry database (SQLite).

Schema:
{schema}

Column notes:
- PoleId: "POLE-01" through "POLE-12"
- Timestamp: datetime string "YYYY-MM-DD HH:MM:SS.fffffff" (7 fractional digits)
- EnergyWatts: power consumption in watts
- PedestrianCount, VehicleCount, CyclistCount: detected traffic counts
- AmbientLightLux: ambient light sensor reading
- TemperatureC: temperature in Celsius
- HumidityPct: humidity percentage
- AirQualityAqi: air quality index (higher = worse)
- NoiseDb: noise level in decibels
- LightLevelPct: light dimming level (0-100%)
- AnomalyFlag: 0 or 1
- AnomalyDescription: text when AnomalyFlag=1, NULL otherwise

Pole zones:
{zones}

Important:
- The simulation has its own clock. Use the data to determine time references.
- For relative time references like "yesterday", first determine the latest timestamp \
in the data, then compute from there. For example: \
DATE((SELECT MAX(Timestamp) FROM TelemetryReadings), '-1 day')
- Use SQLite date/time functions (DATE, TIME, STRFTIME, etc.).
- LIMIT results to 50 rows max.
- Only generate SELECT queries.

Generate 1-5 SQL queries to gather the data needed to answer this question:
{question}

Return ONLY a JSON array of objects, each with "label" (short description) and "sql" (the query).
No markdown fences, no explanation — just the JSON array."""


def _parse_query_json(raw: str) -> list[dict[str, str]]:
    """Extract a JSON array of query objects from LLM output."""
    # Strip markdown fences if present
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```\w*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    queries = json.loads(cleaned)
    if not isinstance(queries, list):
        return []
    return [q for q in queries if isinstance(q, dict) and "sql" in q]


_RETRY_PROMPT = """\
The following SQL queries failed against a SQLite database. Fix them based on the errors.

Schema:
{schema}

Failed queries:
{failures}

Return ONLY a JSON array of objects with "label" and "sql" keys. No explanation."""


async def _generate_sql_queries(
    question: str, schema: str, cfg: LLMConfig,
) -> list[dict[str, str]]:
    """Ask the LLM to generate SQL queries for the user's question."""
    prompt = _QUERY_GEN_PROMPT.format(
        schema=schema, zones=_ZONE_LIST, question=question,
    )
    raw = await _call_llm(prompt, cfg)
    return _parse_query_json(raw)


async def _fix_failed_queries(
    failed: list[dict[str, str]], schema: str, cfg: LLMConfig,
) -> list[dict[str, str]]:
    """Ask the LLM to fix queries that returned errors."""
    failures_text = "\n".join(
        f"- Label: {f['label']}\n  SQL: {f['sql']}\n  Error: {f['error']}"
        for f in failed
    )
    prompt = _RETRY_PROMPT.format(schema=schema, failures=failures_text)
    raw = await _call_llm(prompt, cfg)
    return _parse_query_json(raw)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(
    query: str,
    query_results_text: str,
    rag_narratives: list[str] | None,
) -> str:
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

    sections.append(query_results_text)

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

    if not cfg.api_key:
        yield {"event": "token", "data": {"text": "No API key provided. Please configure your LLM API key in the chat settings."}}
        yield {"event": "done", "data": {}}
        return

    # --- Step 1: Generate SQL queries via LLM ---
    schema = get_table_schema(engine)
    if not schema:
        yield {"event": "token", "data": {"text": "Database schema not available."}}
        yield {"event": "done", "data": {}}
        return

    try:
        generated = await _generate_sql_queries(query, schema, cfg)
    except Exception as e:
        logger.exception("SQL generation failed")
        yield {"event": "token", "data": {"text": f"Failed to generate queries: {e}"}}
        yield {"event": "done", "data": {}}
        return

    if not generated:
        generated = [{"label": "All data (fallback)", "sql": "SELECT * FROM TelemetryReadings ORDER BY Id DESC LIMIT 50"}]

    # --- Step 2: Execute queries ---
    query_results = execute_queries(engine, generated)

    # --- Step 3: Retry failed queries ---
    failed = [
        {"label": qr.label, "sql": qr.query, "error": qr.error}
        for qr in query_results if qr.error
    ]
    if failed:
        try:
            fixed = await _fix_failed_queries(failed, schema, cfg)
            if fixed:
                fixed_results = execute_queries(engine, fixed)
                # Replace failed entries with retried results
                successful = [qr for qr in query_results if not qr.error]
                query_results = successful + fixed_results
        except Exception:
            logger.exception("Query retry failed")
            # Keep original results (with errors) — LLM will note them

    # --- Step 4: Send query metadata to frontend ---
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
                for q in query_results
            ],
        },
    }

    # --- Step 5: RAG retrieval ---
    rag_narratives: list[str] | None = None
    rag_chunks = []
    if _needs_rag(query):
        rag_chunks = retriever.search(query, top_k=top_k)
        if rag_chunks:
            rag_narratives = [c.text for c in rag_chunks]
            logger.info("Retrieved %d incident log chunks via RAG", len(rag_narratives))

    if rag_chunks:
        structured_sources = [
            {"text": c.text, "timestamp": c.timestamp, "poleIds": c.pole_ids}
            for c in rag_chunks
        ]
        yield {"event": "sources", "data": {"sources": structured_sources}}

    # --- Step 6: Build prompt and stream answer ---
    logger.info("Streaming from %s (model=%s)", cfg.provider, cfg.effective_model)
    query_results_text = format_query_results(query_results)
    prompt = _build_prompt(query, query_results_text, rag_narratives)
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
# Provider streaming calls
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
