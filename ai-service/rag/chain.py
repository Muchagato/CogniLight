"""RAG chain: retrieve context + generate response."""
from __future__ import annotations

import os

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
            "Traffic varies by zone: Office/Tower poles peak during work hours (8-18h), "
            "Retail/Mall poles see most activity 10-21h, School poles spike at drop-off "
            "(~8h) and pickup (~15h), while Residential/Apartment poles peak during "
            "morning and evening commutes. Parks attract pedestrians and cyclists in "
            "mornings and evenings. Hotels maintain steady activity throughout the day."
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
