# CogniLight

**A cognitive sensing platform for smart city lighting networks.**

CogniLight is a full-stack simulation of a smart city lighting network. It models a city block with 12 smart light poles — each equipped with virtual sensors producing real-time telemetry — and provides a telemetry dashboard, animated street simulation, and an AI-powered natural language interface for querying the data.

The project demonstrates how modern web technologies, real-time data pipelines, and AI can work together in an IoT/smart city context. It was built as a portfolio piece for a Full-Stack R&D position at a multinational public lighting company.

---

## What You'll Find Here

This documentation serves as both a technical reference and an educational walkthrough. Rather than just describing *what* the code does, it explains *why* it's done that way — the trade-offs, the patterns, and the reasoning behind each decision.

| Section | What's Inside |
|---------|--------------|
| [Architecture](architecture/index.md) | How the three services interact, data flow diagrams, and key design decisions |
| [Backend (.NET)](backend/index.md) | The simulation engine, telemetry storage, SignalR hub, and REST API |
| [Frontend (Angular)](frontend/index.md) | The canvas-based street simulation, ECharts dashboard, and AI chat panel |
| [AI Service (Python)](ai-service/index.md) | The hybrid SQL+RAG pipeline, FAISS vector search, and anomaly detection |
| [Infrastructure](infrastructure/index.md) | Docker Compose, CI/CD with GitHub Actions, and NAS deployment |
| [Lessons Learned](lessons-learned.md) | Gotchas, surprising behaviors, and things that required iteration |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Angular, TypeScript, HTML5 Canvas, ECharts, SignalR client | Angular 21 |
| Backend | C#, .NET, EF Core, SQLite, SignalR | .NET 10 |
| AI Service | Python, FastAPI, sentence-transformers, FAISS | Python 3.11+ |
| Containerization | Docker Compose | Multi-stage builds |
| CI/CD | GitHub Actions → GHCR → Watchtower | Automated |

---

## Quick Start

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 22+](https://nodejs.org/)
- [Python 3.11+](https://www.python.org/downloads/)

### Running Locally

=== "Docker Compose (recommended)"

    ```bash
    docker compose up --build
    ```

    Services start at: frontend (`:4200`), backend (`:5000`), ai-service (`:8000`).

=== "npm scripts"

    ```bash
    npm run setup   # install all dependencies (npm + Python venv)
    npm run dev     # start backend, frontend, and AI service concurrently
    ```

=== "Manual (each service)"

    ```bash
    # Terminal 1: Backend
    cd backend/CogniLight.Api
    dotnet run --launch-profile http

    # Terminal 2: Frontend
    cd frontend
    npm install && npx ng serve

    # Terminal 3: AI Service (optional)
    cd ai-service
    pip install -r requirements.txt
    uvicorn main:app --port 8000
    ```

Open [http://localhost:4200](http://localhost:4200) to see the application.

### Enabling AI Chat

The AI chat uses a BYOK (Bring Your Own Key) model. Configure your LLM API key in the chat panel's settings gear icon. Supports Anthropic (Claude) and OpenAI-compatible providers.

---

## Repository Structure

```
cognilight/
├── frontend/                    # Angular 21 application
│   ├── src/app/
│   │   ├── simulation/          # HTML5 Canvas street scene
│   │   ├── dashboard/           # ECharts telemetry dashboard
│   │   ├── chat/                # AI chat component
│   │   ├── home/                # Layout orchestrator
│   │   └── shared/              # Services, models, theme
│   ├── nginx.conf               # Reverse proxy config
│   └── Dockerfile
├── backend/                     # .NET 10 API
│   └── CogniLight.Api/
│       ├── Program.cs           # Endpoints, middleware, startup
│       ├── Services/            # SimulationEngine, TelemetryService
│       ├── Models/              # EF Core entities
│       ├── Hubs/                # SignalR hub
│       └── Dockerfile
├── ai-service/                  # Python FastAPI
│   ├── main.py                  # Endpoints, background tasks
│   ├── rag/                     # Hybrid SQL+RAG pipeline
│   ├── anomaly/                 # Rule-based anomaly detection
│   └── Dockerfile
├── docker-compose.yml           # Development orchestration
├── docker-compose.prod.yml      # Production (NAS) orchestration
├── .github/workflows/ci.yml     # CI/CD pipeline
└── docs/                        # This documentation site
```
