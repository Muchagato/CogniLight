"""CogniLight AI Service — RAG over telemetry + anomaly detection."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv

# Load .env BEFORE importing modules that read env vars at import time
# Search parent directories so it finds the project-root .env
from pathlib import Path
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sse_starlette.sse import EventSourceResponse  # noqa: E402

from anomaly.detector import detect_anomalies, summarize_anomalies, AnomalyReport  # noqa: E402
from rag.chain import generate_response, generate_response_stream, is_llm_configured  # noqa: E402
from rag.retriever import Chunk, Retriever  # noqa: E402

DB_PATH = os.getenv("DATABASE_PATH", "../backend/CogniLight.Api/cognilight.db")
INGEST_INTERVAL = int(os.getenv("INGEST_INTERVAL", "10"))  # seconds

if is_llm_configured():
    logger.info("LLM API key is set (provider=%s, model=%s)", os.getenv("LLM_PROVIDER", "anthropic"), os.getenv("LLM_MODEL", "default"))
else:
    logger.warning("LLM API key is NOT set — chat will be disabled")

retriever = Retriever()
_latest_anomalies: list[AnomalyReport] = []
_last_ingested_id: int = 0

# Pole-to-zone mapping — mirrors backend SimulationEngine.PoleZones
POLE_ZONES: dict[str, str] = {
    "POLE-01": "Office",
    "POLE-02": "Retail",
    "POLE-03": "Park",
    "POLE-04": "School",
    "POLE-05": "Mall",
    "POLE-06": "Apartment",
    "POLE-07": "Gym",
    "POLE-08": "Residential",
    "POLE-09": "Cafe",
    "POLE-10": "Mixed-use",
    "POLE-11": "Tower",
    "POLE-12": "Hotel",
}


def _get_engine():
    return create_engine(f"sqlite:///{DB_PATH}", echo=False)


def _ingest_new_readings() -> int:
    """Read new telemetry from SQLite and add summarized chunks to FAISS."""
    global _last_ingested_id, _latest_anomalies

    try:
        engine = _get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT * FROM TelemetryReadings WHERE Id > :last_id ORDER BY Id LIMIT 500"
                ),
                {"last_id": _last_ingested_id},
            ).fetchall()

            if not rows:
                return 0

            columns = [
                "Id", "PoleId", "Timestamp", "EnergyWatts", "PedestrianCount",
                "VehicleCount", "CyclistCount", "AmbientLightLux", "TemperatureC",
                "HumidityPct", "AirQualityAqi", "NoiseDb", "LightLevelPct",
                "AnomalyFlag", "AnomalyDescription",
            ]
            readings: list[dict[str, Any]] = [dict(zip(columns, row)) for row in rows]
            _last_ingested_id = max(r["Id"] for r in readings)

            # Detect anomalies
            _latest_anomalies = detect_anomalies(readings)

            # Group readings by timestamp for summarization
            by_time: dict[str, list[dict[str, Any]]] = {}
            for r in readings:
                ts = r["Timestamp"]
                by_time.setdefault(ts, []).append(r)

            chunks: list[Chunk] = []
            for ts, group in by_time.items():
                summary = _summarize_group(ts, group)
                pole_ids = [r["PoleId"] for r in group]
                chunks.append(Chunk(text=summary, timestamp=ts, pole_ids=pole_ids))

            retriever.add_chunks(chunks)
            return len(chunks)
    except Exception:
        return 0


def _summarize_group(timestamp: str, readings: list[dict[str, Any]]) -> str:
    """Create a text summary of a group of readings at the same timestamp."""
    total_energy = sum(r["EnergyWatts"] for r in readings)
    total_ped = sum(r["PedestrianCount"] for r in readings)
    total_veh = sum(r["VehicleCount"] for r in readings)
    total_cyc = sum(r["CyclistCount"] for r in readings)
    avg_aqi = sum(r["AirQualityAqi"] for r in readings) // len(readings)
    avg_temp = sum(r["TemperatureC"] for r in readings) / len(readings)

    anomalies = [r for r in readings if r["AnomalyFlag"]]
    anomaly_text = ""
    if anomalies:
        descs = [r["AnomalyDescription"] for r in anomalies if r["AnomalyDescription"]]
        anomaly_text = " Anomalies: " + "; ".join(descs) + "."

    # Per-pole details with zone context
    pole_parts: list[str] = []
    for r in readings:
        zone = POLE_ZONES.get(r["PoleId"], "Unknown")
        pole_parts.append(
            f"{r['PoleId']} ({zone}): {r['EnergyWatts']:.0f}W, "
            f"{r['PedestrianCount']} ped, {r['VehicleCount']} veh, "
            f"{r['CyclistCount']} cyc, AQI {r['AirQualityAqi']}"
        )

    pole_detail = " Poles: " + "; ".join(pole_parts) + "."

    return (
        f"At {timestamp}: network total {total_energy:.0f}W, "
        f"{total_ped} pedestrians, {total_veh} vehicles, {total_cyc} cyclists. "
        f"Avg AQI {avg_aqi}, temp {avg_temp:.1f}C."
        f"{anomaly_text}{pole_detail}"
    )


async def _ingest_loop():
    """Background task that periodically ingests new readings."""
    while True:
        _ingest_new_readings()
        await asyncio.sleep(INGEST_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_ingest_loop())
    yield
    task.cancel()


app = FastAPI(title="CogniLight AI Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service", "index_size": str(retriever.size)}


@app.get("/api/chat/status")
async def chat_status() -> dict[str, bool]:
    return {"configured": is_llm_configured()}


# --- Chat ---

class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    reply, sources = await generate_response(request.message, retriever)
    return ChatResponse(reply=reply, sources=sources)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    import json

    async def event_generator():
        async for event in generate_response_stream(request.message, retriever):
            yield {"event": event["event"], "data": json.dumps(event["data"])}

    return EventSourceResponse(event_generator())


# --- Anomaly detection ---

@app.get("/api/anomalies/summary")
async def anomaly_summary() -> dict[str, str]:
    summary = summarize_anomalies(_latest_anomalies)
    return {"summary": summary}


@app.get("/api/anomalies/recent")
async def recent_anomalies() -> list[dict[str, str]]:
    return [
        {
            "poleId": a.pole_id,
            "timestamp": a.timestamp,
            "type": a.anomaly_type,
            "description": a.description,
            "severity": a.severity,
        }
        for a in _latest_anomalies[:20]
    ]


# --- Suggested prompts ---

@app.get("/api/chat/suggestions")
async def chat_suggestions() -> list[str]:
    return [
        "Summarize the last hour of telemetry",
        "Which poles are consuming the most energy?",
        "Any anomalies detected recently?",
        "Compare traffic between morning and evening",
        "What's the current air quality across the network?",
    ]
