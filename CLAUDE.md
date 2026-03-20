# CogniLight

Full-stack smart city lighting simulation: Angular 21 frontend, .NET 10 backend, Python AI service. Portfolio project for a cognitive sensing R&D role.

## Commands

```bash
# Backend (.NET 10)
cd backend/CogniLight.Api && dotnet run --launch-profile http    # :5000

# Frontend (Angular 21)
cd frontend && npm install && npx ng serve                        # :4200

# AI Service (Python)
cd ai-service && pip install -r requirements.txt && uvicorn main:app --port 8000

# Docker (all services)
docker compose up --build    # frontend :4200, backend :5000, ai-service :8000

# Docs (MkDocs Material)
cd docs && pip install -r requirements.txt && mkdocs serve        # :8080
```

## Architecture

Three services sharing a single SQLite database. Backend is the sole writer; AI service reads directly.

- **Real-time:** SignalR pushes telemetry (1s ticks) and incident logs. Never poll for live data.
- **Historical:** REST endpoints with bucketed aggregation for time-range queries.
- **AI Chat:** SSE streaming. Hybrid SQL (always) + RAG over incident logs (default-on, skipped only for trivial factual queries).
- **LLM:** BYOK model — API key stored in browser localStorage, sent per-request via `X-LLM-*` headers. Supports Anthropic and OpenAI providers.

## Key Files

| Area | Files |
|------|-------|
| Endpoints + startup | `backend/CogniLight.Api/Program.cs` |
| Simulation engine | `backend/CogniLight.Api/Services/SimulationEngine.cs` |
| Data access + aggregation | `backend/CogniLight.Api/Services/TelemetryService.cs` |
| Incident log generation | `backend/CogniLight.Api/Services/IncidentLogGenerator.cs` |
| Canvas renderer | `frontend/src/app/simulation/simulation.renderer.ts` + `renderer/` |
| SignalR + REST client | `frontend/src/app/shared/services/telemetry.service.ts` |
| Chat SSE streaming | `frontend/src/app/chat/chat.component.ts` |
| RAG pipeline + LLM calls | `ai-service/rag/chain.py` |
| SQL context builder | `ai-service/rag/sql_context.py` |
| FAISS retriever | `ai-service/rag/retriever.py` |
| Nginx reverse proxy | `frontend/nginx.conf` |

## Theming (3-file sync)

Canvas and ECharts can't read CSS vars, so colors are defined in three files that must stay in sync:

1. `frontend/src/app/theme.scss` — CSS custom properties (`var(--cl-*)`)
2. `frontend/src/app/simulation/renderer/theme.ts` — `RT` const for canvas
3. `frontend/src/app/shared/chart-theme.ts` — `CT` const for ECharts

## Gotchas

- **EF Core `EnsureCreated()` limitation:** Won't add new tables to an existing DB. When adding new entities, also add `CREATE TABLE IF NOT EXISTS` in `Program.cs` startup.
- **SQLite timestamp format:** .NET writes 7-digit fractional seconds (`2026-03-19 22:53:10.1797267`). Python `%f` only handles 6 — truncate or read as string.
- **Anomaly detector key casing:** `anomaly/detector.py` expects camelCase; SQLite columns are PascalCase. Normalize in `main.py` before calling `detect_anomalies()`.
- **Backend log noise:** EF Core and SignalR log at Information level every tick. Filtered in `Program.cs` via `builder.Logging.AddFilter()`.
- **Singleton + scoped DbContext:** `TelemetryService` and `IncidentLogGenerator` are singletons but need scoped `AppDbContext`. Use `IServiceScopeFactory` to create scopes on demand.
- **Canvas outside NgZone:** The animation loop runs via `zone.runOutsideAngular()` to avoid 60fps change detection. Re-enter the zone for SignalR callbacks.
- **Aggregation CTE:** `TelemetryService.GetAggregatedHistoryAsync` uses a two-pass CTE — first SUM across poles per tick, then AVG per bucket. Without this, bucket values scale with bucket size.
- **Frontend Dockerfile context:** Build context is the repo root (not `./frontend`) because the Dockerfile also builds the MkDocs docs site. Set in `docker-compose.yml` and `ci.yml`.

## Documentation

Full technical docs at `/docs` when running in Docker, or locally via `mkdocs serve` in the `docs/` directory. Covers architecture, data flow, design decisions, API reference, and lessons learned. **Keep docs in sync when making code changes.**
