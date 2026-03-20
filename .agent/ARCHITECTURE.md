# Architecture Overview

> Generated: 2026-03-20 12:50
> Audited by: Codebase Audit Agent (Phase 1)

## Documentation Inventory (`docs/`)

| Document | Purpose | Matches Code? |
|----------|---------|---------------|
| `docs/docs/index.md` | Project overview, tech stack, quick start | ✅ |
| `docs/docs/lessons-learned.md` | Gotchas and solutions | ✅ |
| `docs/docs/architecture/index.md` | Three-service architecture diagram | ✅ |
| `docs/docs/architecture/data-flow.md` | Real-time, historical, AI chat flows | ✅ |
| `docs/docs/architecture/design-decisions.md` | ADRs (SQLite, BYOK, SignalR, etc.) | ✅ |
| `docs/docs/backend/index.md` | Backend overview, startup, models | ✅ |
| `docs/docs/backend/simulation-engine.md` | Simulation tick, zones, anomalies | ✅ |
| `docs/docs/backend/telemetry-service.md` | Data access, CTE aggregation | ✅ |
| `docs/docs/backend/incident-logs.md` | Log generation, templates | ✅ |
| `docs/docs/backend/api-reference.md` | REST endpoints, SignalR events | ✅ |
| `docs/docs/frontend/index.md` | Angular overview, component tree | ✅ |
| `docs/docs/frontend/simulation.md` | Canvas renderer, world layout | ✅ |
| `docs/docs/frontend/dashboard.md` | KPIs, charts, time ranges | ✅ |
| `docs/docs/frontend/chat.md` | SSE streaming, BYOK, messages | ✅ |
| `docs/docs/frontend/theming.md` | 3-file theme system | ✅ |
| `docs/docs/ai-service/index.md` | AI service overview, startup | ✅ |
| `docs/docs/ai-service/rag-pipeline.md` | SQL+RAG hybrid pipeline | ✅ |
| `docs/docs/ai-service/anomaly-detection.md` | Rule-based anomaly classification | ✅ |
| `docs/docs/ai-service/api-reference.md` | Chat, anomaly, suggestion endpoints | ✅ |
| `docs/docs/infrastructure/index.md` | Deployment overview diagram | ✅ |
| `docs/docs/infrastructure/docker.md` | Dockerfiles, compose files | ✅ |
| `docs/docs/infrastructure/ci-cd.md` | GitHub Actions workflow | ✅ |
| `docs/docs/infrastructure/deployment.md` | NAS deployment, monitoring | ⚠️ See D-001 |
| `docs/mkdocs.yml` | MkDocs Material config | ⚠️ See D-002 |

### Key Takeaways from docs/

- Architecture is thoroughly documented: 23 markdown files covering every layer
- Docs accurately describe the codebase with few exceptions (noted below)
- Design decisions are well-reasoned with clear rationale
- Lessons learned captures real gotchas from development
- Infrastructure docs describe the full deployment pipeline

## Stack Map

| Layer | Tech | Entry Point | Build Command |
|-------|------|-------------|---------------|
| Frontend | Angular 21.2, TypeScript 5.9, ECharts 6 | `src/main.ts` | `npx ng build` |
| Backend | .NET 10, EF Core 10, SQLite | `Program.cs` | `dotnet build` |
| AI Service | Python 3.11, FastAPI, FAISS, httpx | `main.py` | `uvicorn main:app` |
| Docs | MkDocs Material 9.5+ | `docs/mkdocs.yml` | `mkdocs build` |

## Shared Contracts

- **Database schema**: Defined by EF Core models in C#, read via raw SQL in Python. Column names (PascalCase) are manually mapped to camelCase in `main.py`.
- **SignalR events**: `TelemetryUpdate` (12 readings + time), `IncidentLog` (id, timestamp, poleId, author, category, text). Consumed by Angular `TelemetryService`.
- **SSE events**: `sql_context`, `sources`, `token`, `done`. Produced by `chain.py`, parsed by `chat.component.ts`.
- **REST endpoints**: Backend serves `/api/telemetry/*`, `/api/incidents`, `/api/simulation/*`. AI service serves `/api/chat/*`, `/api/anomalies/*`.
- **LLM headers**: `X-LLM-API-Key`, `X-LLM-Provider`, `X-LLM-Model` — sent by frontend, consumed by AI service.
- **No OpenAPI spec or shared type definitions** — contracts are implicit, validated by convention.

## Key Integration Points

1. **Frontend → Backend**: SignalR WebSocket (`/hubs/telemetry`) for live telemetry; REST for history queries. Proxied via `proxy.conf.json` in dev, nginx in prod.
2. **Frontend → AI Service**: REST + SSE (`/api/chat/stream`) for chat. Same proxy config.
3. **AI Service → Backend (SQLite)**: Direct SQLite file read via SQLAlchemy. Shared volume in Docker. No API calls between services.
4. **Nginx**: Routes `/api/chat/`, `/api/anomalies/`, `/api/debug/` to AI service. All other `/api/` to backend. `/hubs/` to backend with WebSocket upgrade.

## Build Verification

| Layer | Result | Notes |
|-------|--------|-------|
| Frontend | ✅ Compiles | 1 CSS budget warning: `chat.component.scss` exceeds 12KB limit by 1.11KB |
| Backend | ✅ Compiles | 0 errors, 0 warnings |
| AI Service | ✅ Syntax OK | All Python files pass syntax check |

## Observations

- Codebase is clean, well-structured, and consistent within each layer
- Three-file theme system is faithfully maintained across SCSS, Canvas, and ECharts
- No dead code, orphaned routes, or unused imports detected
- Test coverage is minimal: only `app.spec.ts` exists for frontend, no backend or AI service tests
- The project is well-documented relative to its scope as a portfolio project
