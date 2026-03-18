# CogniLight — Cognitive Sensing Platform for Smart Lighting Networks

A full-stack simulation of a smart city lighting network with cognitive sensing capabilities. Simulates a city block with 12 smart light poles, each equipped with virtual sensors producing real-time telemetry.

## Architecture

```
Angular Frontend (port 4200)
  ├── Street Simulation (HTML5 Canvas)
  ├── Telemetry Dashboard (ECharts)
  └── AI Chat (RAG-powered)
         ↕ SignalR / REST
.NET Backend (port 5000)
  ├── SimulationEngine (IHostedService)
  ├── SignalR TelemetryHub
  └── SQLite via EF Core
         ↕ SQLite
Python AI Service (port 8000)
  ├── RAG Pipeline (FAISS + sentence-transformers)
  └── Anomaly Detection
```

## Quick Start

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 22+](https://nodejs.org/)
- [Python 3.11+](https://www.python.org/downloads/)

### 1. Backend

```bash
cd backend/CogniLight.Api
dotnet run --launch-profile http
```

The API starts on `http://localhost:5000`. The simulation engine begins generating telemetry immediately.

### 2. Frontend

```bash
cd frontend
npm install
npx ng serve
```

Open `http://localhost:4200`. The Overview page shows the street simulation (top) and telemetry dashboard (bottom).

### 3. AI Service (optional)

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --port 8000
```

The AI service reads telemetry from the backend's SQLite database and provides RAG-powered chat. Works in demo mode without an LLM API key.

To use a real LLM, set environment variables:
```bash
export LLM_API_KEY=your-key-here
export LLM_BASE_URL=https://api.openai.com/v1  # or any OpenAI-compatible endpoint
export LLM_MODEL=gpt-4o-mini
```

### Docker Compose

```bash
docker compose up --build
```

Services: frontend (:4200), backend (:5000), ai-service (:8000).

## Features

### Street Simulation
- Top-down 2D canvas rendering of a city block with two streets and a crossroad
- 12 light poles with sensor radius visualization and adaptive glow effects
- Animated entities (pedestrians, vehicles, cyclists) driven by real-time counts
- Time-of-day cycle with lighting effects, vehicle headlights, building windows
- Play/pause and speed controls (1x, 2x, 5x, 10x)
- Click-to-select pole interaction

### Telemetry Dashboard
- KPI summary cards: total energy, pedestrian/vehicle counts, AQI, anomaly count
- Real-time ECharts: energy consumption, stacked traffic density, environmental metrics
- Per-pole detail table with radar chart on selection
- Anomaly log with timestamped events

### AI Chat
- RAG pipeline: telemetry → text summaries → FAISS embeddings → context retrieval
- Natural language queries about energy, traffic, anomalies, trends
- Demo mode with rule-based responses when no LLM API key is configured
- Suggested prompts for common queries

### Per-Pole Telemetry
Each pole generates every simulation tick:
- Energy consumption (50-250W, adaptive dimming)
- Pedestrian, vehicle, cyclist counts
- Ambient light (solar curve), temperature, humidity
- Air quality index, noise level
- Light output level (adaptive)
- Anomaly flags (~3% injection rate)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21, TypeScript, HTML5 Canvas, ECharts, SignalR client |
| Backend | .NET 10, C#, EF Core, SQLite, SignalR |
| AI Service | Python 3.11, FastAPI, sentence-transformers, FAISS |
| Containerization | Docker Compose |
