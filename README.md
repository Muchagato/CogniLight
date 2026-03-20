# CogniLight

A full-stack simulation of a smart city lighting network with cognitive sensing capabilities. Twelve smart light poles generate real-time telemetry across a simulated city block — each pole aware of its surroundings, adapting its behavior to zone type, time of day, and detected activity.

Built with Angular 21, .NET 10, and Python (FastAPI), deployed via Docker Compose with automated CI/CD to a self-hosted NAS.

## How It Works

The backend runs a simulation engine that ticks once per second, producing telemetry for every pole: energy consumption, pedestrian/vehicle/cyclist counts, environmental readings, and adaptive dimming output. Each pole's behavior is shaped by its zone type — an office district is busy during work hours and dead at night, while a hotel maintains steady activity around the clock.

Telemetry is pushed to the frontend in real time via SignalR. The dashboard visualizes it with time-series charts, KPI cards, and per-pole drill-down. The street simulation renders the same data as an animated canvas scene with entities fading in and out based on live counts.

An AI chat interface lets users query the data in natural language. It uses a hybrid pipeline: direct SQL queries for current network state, plus semantic search (FAISS) over maintenance incident logs for narrative context. Users bring their own LLM API key (Anthropic or OpenAI).

## Running It

```bash
docker compose up --build
```

Open [localhost:4200](http://localhost:4200). The simulation starts immediately.

Or run each service individually:

```bash
# Backend — starts simulation engine, serves REST + SignalR on :5000
cd backend/CogniLight.Api && dotnet run --launch-profile http

# Frontend — Angular dev server on :4200
cd frontend && npm install && npx ng serve

# AI Service (optional) — FastAPI on :8000
cd ai-service && pip install -r requirements.txt && uvicorn main:app --port 8000
```

## Architecture

```
Angular 21 (:4200)                    .NET 10 (:5000)               Python FastAPI (:8000)
┌─────────────────────┐         ┌──────────────────────┐       ┌───────────────────────┐
│  Street Simulation  │◄──WS────│  SimulationEngine    │       │  Hybrid SQL+RAG       │
│  (HTML5 Canvas)     │         │  (1s tick, 12 poles) │       │  Pipeline             │
│                     │         │                      │       │                       │
│  Dashboard          │◄──WS────│  IncidentLogGenerator│       │  FAISS Vector Index   │
│  (ECharts)          │         │  (anomaly follow-ups)│       │  (incident logs)      │
│                     │         │                      │       │                       │
│  AI Chat            │──SSE───►│  SignalR Hub         │       │  Anomaly Detector     │
│  (BYOK streaming)   │         │  REST API            │       │  (rule-based)         │
└─────────────────────┘         └──────────┬───────────┘       └───────────┬───────────┘
                                           │                               │
                                           └──────── SQLite ◄──────────────┘
                                                   (shared volume)
```

All three services share a single SQLite database. The backend is the sole writer; the AI service reads it directly for query context.

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite** over Postgres | Single-file DB, no infrastructure dependency. WAL mode handles concurrent reader/writer safely. |
| **SignalR** for real-time | Automatic reconnection, transport fallback, message framing — avoids building these on raw WebSocket. |
| **SSE** for chat streaming | Unidirectional token stream. Simpler than WebSocket, supports named events (`sql_context`, `sources`, `token`). |
| **BYOK** for LLM access | API key stays in browser localStorage, passes through per-request. No server-side secret management. |
| **Hybrid SQL+RAG** | Structured queries for current state (always fresh), semantic search for incident logs (narrative context). |
| **3-file theme** | Canvas 2D and ECharts can't read CSS variables, so colors are synced across `theme.scss`, `renderer/theme.ts`, and `chart-theme.ts`. |

## Tech Stack

| | |
|---|---|
| **Frontend** | Angular 21, TypeScript, HTML5 Canvas, ECharts, SignalR client |
| **Backend** | .NET 10, C#, EF Core, SQLite, SignalR |
| **AI Service** | Python 3.11, FastAPI, FAISS, sentence-transformers, httpx |
| **Infrastructure** | Docker Compose, GitHub Actions, GHCR, Watchtower |

## Documentation

Comprehensive technical docs are built into the application at [`/docs`](http://localhost:4200/docs) — covering architecture, data flow, every service in depth, API reference, infrastructure, and lessons learned.

To preview the docs locally:

```bash
cd docs
pip install -r requirements.txt
mkdocs serve
```
