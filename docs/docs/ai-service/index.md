# AI Service (Python)

The AI service is a Python FastAPI application that provides intelligence on top of raw telemetry data. It combines direct SQL queries for structured state with semantic search over incident logs (RAG) to answer natural language questions about the lighting network.

---

## Key Design Choices

- **FastAPI** — async-first, automatic OpenAPI docs, Pydantic validation
- **BYOK (Bring Your Own Key)** — no server-side API keys; credentials pass through per-request
- **Direct SQLite access** — reads from the same database file as the backend (no inter-service REST calls)
- **In-memory FAISS** — vector index lives in RAM, rebuilt from SQLite on startup
- **Background ingestion loop** — polls for new data every 10 seconds rather than requiring push notifications

---

## Project Structure

```
ai-service/
├── main.py                      # FastAPI app, endpoints, background tasks
├── constants.py                 # Shared POLE_ZONES, TELEMETRY_COLUMNS
├── rag/
│   ├── chain.py                 # Text-to-SQL generation, prompt builder, LLM streaming
│   ├── sql_context.py           # Schema introspection, query execution, result formatting
│   ├── retriever.py             # FAISS vector search
│   ├── narrative.py             # Incident log ingestion into FAISS
│   └── embeddings.py            # Sentence-transformer or demo embeddings
├── anomaly/
│   └── detector.py              # Rule-based anomaly classification
├── requirements.txt             # Python dependencies
└── Dockerfile                   # Single-stage Python image
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | ≥0.115 | Web framework |
| `uvicorn` | ≥0.30 | ASGI server |
| `slowapi` | ≥0.1.9 | Rate limiting (available, not yet configured per-endpoint) |
| `sentence-transformers` | ≥3.0 | Text embedding model (`all-MiniLM-L6-v2`) |
| `faiss-cpu` | ≥1.9 | Vector similarity search |
| `sqlalchemy` | ≥2.0.30 | SQLite access |
| `httpx` | ≥0.27 | Async HTTP client (for LLM API calls) |
| `python-dotenv` | ≥1.0.1 | Environment variable loading |
| `pydantic` | ≥2.8 | Request/response validation |
| `sse-starlette` | ≥2.0 | Server-Sent Events response |

---

## Startup Flow

The `lifespan` context manager handles initialization:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Load existing incident logs from SQLite into FAISS
    persisted_chunks, last_id = load_persisted_incidents(engine)
    if persisted_chunks:
        retriever.add_chunks(persisted_chunks)

    # 2. Start background ingestion loop
    task = asyncio.create_task(_ingest_loop())
    yield
    task.cancel()
```

### Background Ingestion

A background task runs every 10 seconds:

1. **Incident ingestion** — checks for new rows in `IncidentLogs` table since last ingested ID, embeds them, adds to FAISS
2. **Anomaly ingestion** — checks for new telemetry readings with `AnomalyFlag=1`, classifies severity, maintains a rolling buffer of 100 recent anomalies

---

## Per-Request LLM Configuration

Every chat request extracts LLM configuration from HTTP headers:

```python
def _extract_llm_config(request: Request) -> LLMConfig:
    return LLMConfig(
        api_key=request.headers.get("x-llm-api-key", ""),
        provider=request.headers.get("x-llm-provider", "anthropic"),
        model=request.headers.get("x-llm-model", ""),
    )
```

The `LLMConfig` dataclass provides sensible defaults:

- Anthropic: `claude-haiku-4-5-20251001` at `https://api.anthropic.com`
- OpenAI: `gpt-4.1-nano` at `https://api.openai.com/v1`

---

## Error Handling

- **Global exception handler** — catches all unhandled exceptions, logs them, returns a generic 500 response. Never leaks internal details to the client.
- **LLM failures** — caught and returned as error text in the chat response, not HTTP errors. This lets the frontend display the error in the chat flow rather than showing a generic error screen.
- **Missing IncidentLogs table** — gracefully handled during startup (the backend may not have created it yet).

---

## What's Next

- [Hybrid SQL + RAG Pipeline](rag-pipeline.md) — the query classification and prompt building system
- [Anomaly Detection](anomaly-detection.md) — rule-based anomaly classification
- [API Reference](api-reference.md) — all FastAPI endpoints
