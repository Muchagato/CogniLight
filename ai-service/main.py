"""CogniLight AI Service — hybrid SQL + RAG over incident logs + anomaly detection."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv

# Load .env BEFORE importing modules that read env vars at import time
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
from constants import TELEMETRY_COLUMNS  # noqa: E402
from rag.chain import generate_response, generate_response_stream, is_llm_configured  # noqa: E402
from rag.narrative import load_persisted_incidents, ingest_new_incidents  # noqa: E402
from rag.retriever import Retriever  # noqa: E402

DB_PATH = os.getenv("DATABASE_PATH", "../backend/CogniLight.Api/cognilight.db")
INGEST_INTERVAL = int(os.getenv("INGEST_INTERVAL", "10"))  # seconds

if is_llm_configured():
    logger.info("LLM API key is set (provider=%s, model=%s)", os.getenv("LLM_PROVIDER", "anthropic"), os.getenv("LLM_MODEL", "default"))
else:
    logger.warning("LLM API key is NOT set — chat will be disabled")

retriever = Retriever()
_latest_anomalies: list[AnomalyReport] = []
_last_incident_id: int = 0
_last_anomaly_id: int = 0


def _get_engine():
    return create_engine(f"sqlite:///{DB_PATH}", echo=False)


engine = _get_engine()


def _ingest_anomalies() -> None:
    """Detect anomalies from recent readings."""
    global _last_anomaly_id, _latest_anomalies

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT * FROM TelemetryReadings WHERE Id > :last_id ORDER BY Id LIMIT 6000"
                ),
                {"last_id": _last_anomaly_id},
            ).fetchall()

            if not rows:
                return

            readings: list[dict[str, Any]] = [dict(zip(TELEMETRY_COLUMNS, row)) for row in rows]
            _last_anomaly_id = max(r["Id"] for r in readings)

            # Normalize keys to camelCase for the anomaly detector
            camel_readings = [
                {
                    "poleId": r["PoleId"],
                    "timestamp": r["Timestamp"],
                    "energyWatts": r["EnergyWatts"],
                    "pedestrianCount": r["PedestrianCount"],
                    "vehicleCount": r["VehicleCount"],
                    "cyclistCount": r["CyclistCount"],
                    "ambientLightLux": r["AmbientLightLux"],
                    "temperatureC": r["TemperatureC"],
                    "humidityPct": r["HumidityPct"],
                    "airQualityAqi": r["AirQualityAqi"],
                    "noiseDb": r["NoiseDb"],
                    "lightLevelPct": r["LightLevelPct"],
                    "anomalyFlag": r["AnomalyFlag"],
                    "anomalyDescription": r["AnomalyDescription"],
                }
                for r in readings
            ]

            new_anomalies = detect_anomalies(camel_readings)
            if new_anomalies:
                _latest_anomalies = new_anomalies + _latest_anomalies
                _latest_anomalies = _latest_anomalies[:100]
    except Exception:
        logger.exception("Anomaly ingestion failed")


def _ingest_incidents() -> int:
    """Ingest new incident logs from SQLite into FAISS."""
    global _last_incident_id

    chunks, new_id = ingest_new_incidents(engine, _last_incident_id)
    if chunks:
        retriever.add_chunks(chunks)
        _last_incident_id = new_id
    return len(chunks)


async def _ingest_loop():
    """Background task that periodically ingests new data."""
    while True:
        _ingest_incidents()
        _ingest_anomalies()
        await asyncio.sleep(INGEST_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load previously persisted incident logs into FAISS
    global _last_incident_id
    persisted_chunks, last_id = load_persisted_incidents(engine)
    if persisted_chunks:
        retriever.add_chunks(persisted_chunks)
        _last_incident_id = last_id

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


@app.get("/api/debug/chunks")
async def debug_chunks(limit: int = 20, offset: int = 0):
    """Inspect incident log chunks stored in the FAISS index."""
    chunks = retriever.chunks[offset:offset + limit]
    return {
        "total": len(retriever.chunks),
        "showing": f"{offset}-{offset + len(chunks)}",
        "chunks": [
            {"timestamp": c.timestamp, "poleIds": c.pole_ids, "text": c.text}
            for c in chunks
        ],
    }


# --- Chat ---

class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    reply, sources = await generate_response(request.message, retriever, engine)
    return ChatResponse(reply=reply, sources=sources)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    import json

    async def event_generator():
        async for event in generate_response_stream(request.message, retriever, engine):
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
        "Which poles are consuming the most energy right now?",
        "Any maintenance issues or incidents reported recently?",
        "Have there been any recurring sensor problems?",
        "What's the current air quality across the network?",
        "Which poles have had repairs done?",
    ]
