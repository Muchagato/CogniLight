"""RAG chain: retrieve context + generate response."""
from __future__ import annotations

import os
from typing import Optional

import httpx

from .retriever import Retriever


_LLM_API_KEY = os.getenv("LLM_API_KEY", "")
_LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
_LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")


def _build_prompt(query: str, context_chunks: list[str]) -> str:
    context = "\n\n".join(context_chunks)
    return f"""You are CogniLight AI, an assistant analyzing smart street lighting telemetry data.
Answer the user's question based on the telemetry context below. Be concise and data-driven.
If the data doesn't contain relevant information, say so.

--- TELEMETRY CONTEXT ---
{context}
--- END CONTEXT ---

User question: {query}"""


async def generate_response(
    query: str,
    retriever: Retriever,
    top_k: int = 5,
) -> tuple[str, list[str]]:
    """Generate a RAG response. Returns (reply, source_texts)."""
    chunks = retriever.search(query, top_k=top_k)
    source_texts = [c.text for c in chunks]

    if not source_texts:
        return (
            "I don't have enough telemetry data yet to answer that question. "
            "Please wait for the simulation to generate more data.",
            [],
        )

    # If no API key, use demo mode
    if not _LLM_API_KEY:
        return _demo_response(query, source_texts), source_texts

    # Call LLM
    prompt = _build_prompt(query, source_texts)
    try:
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
            reply = data["choices"][0]["message"]["content"]
            return reply, source_texts
    except Exception as e:
        return f"Error calling LLM: {e}. Falling back to summary.\n\n{_demo_response(query, source_texts)}", source_texts


def _demo_response(query: str, sources: list[str]) -> str:
    """Generate a rule-based response from retrieved context."""
    query_lower = query.lower()
    combined = " ".join(sources)

    if "energy" in query_lower or "consumption" in query_lower:
        return (
            "Based on recent telemetry data:\n\n"
            + sources[0] + "\n\n"
            "Energy consumption varies with time of day and traffic density. "
            "Poles with higher pedestrian/vehicle counts consume more energy due to adaptive dimming."
        )
    elif "anomal" in query_lower or "alert" in query_lower:
        anomaly_sources = [s for s in sources if "anomal" in s.lower() or "spike" in s.lower()]
        if anomaly_sources:
            return "Detected anomalies:\n\n" + "\n".join(f"- {s}" for s in anomaly_sources[:3])
        return "No significant anomalies detected in the recent telemetry data."
    elif "traffic" in query_lower or "pedestrian" in query_lower or "vehicle" in query_lower:
        return (
            "Traffic analysis from recent data:\n\n"
            + sources[0] + "\n\n"
            "Traffic patterns follow typical daily cycles with rush-hour peaks around 7-9 AM and 5-7 PM."
        )
    elif "summar" in query_lower:
        return "Here's a summary of recent telemetry:\n\n" + "\n\n".join(sources[:3])
    else:
        return (
            "Based on the available telemetry data:\n\n"
            + sources[0] + "\n\n"
            "For more specific analysis, try asking about energy consumption, "
            "traffic patterns, or anomalies."
        )
