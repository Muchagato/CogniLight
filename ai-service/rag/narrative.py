"""Incident log ingestion — loads free-text maintenance/incident logs into FAISS."""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from rag.retriever import Chunk

logger = logging.getLogger(__name__)


def load_persisted_incidents(engine: Engine) -> tuple[list[Chunk], int]:
    """Load all incident logs from SQLite for FAISS indexing.

    Returns (chunks, last_ingested_id).
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT Id, Timestamp, PoleId, Author, Category, Text "
                     "FROM IncidentLogs ORDER BY Id")
            ).fetchall()
    except Exception:
        logger.info("IncidentLogs table not found yet — backend may not have started")
        return [], 0

    if not rows:
        return [], 0

    last_id = max(row[0] for row in rows)
    chunks = [
        Chunk(
            text=f"[{row[4].upper()}] {row[3]} — {row[5]}",
            timestamp=str(row[1]),
            pole_ids=[row[2]],
        )
        for row in rows
    ]
    logger.info("Loaded %d persisted incident logs (last id: %d)", len(chunks), last_id)
    return chunks, last_id


def ingest_new_incidents(
    engine: Engine,
    last_ingested_id: int,
) -> tuple[list[Chunk], int]:
    """Read new incident logs since last_ingested_id.

    Returns (new_chunks, new_last_ingested_id).
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT Id, Timestamp, PoleId, Author, Category, Text "
                    "FROM IncidentLogs WHERE Id > :last_id ORDER BY Id LIMIT 100"
                ),
                {"last_id": last_ingested_id},
            ).fetchall()
    except Exception:
        return [], last_ingested_id

    if not rows:
        return [], last_ingested_id

    new_last_id = max(row[0] for row in rows)
    chunks = [
        Chunk(
            text=f"[{row[4].upper()}] {row[3]} — {row[5]}",
            timestamp=str(row[1]),
            pole_ids=[row[2]],
        )
        for row in rows
    ]
    if chunks:
        logger.info("Ingested %d new incident logs", len(chunks))
    return chunks, new_last_id
