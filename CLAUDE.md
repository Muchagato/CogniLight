# CogniLight — Cognitive Sensing Platform for Smart Lighting Networks

## Project Overview

A full-stack simulation of a smart city lighting network with cognitive sensing capabilities.
Simulates a city block with ~12 smart light poles, each equipped with virtual sensors.
Three-layer architecture: animated street simulation, real-time telemetry dashboard, and AI-powered natural language analysis (RAG over telemetry).

**This is a portfolio/interview project for a Full-Stack R&D position at a multinational public lighting company building a cognitive sensing platform for smart cities.**

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Angular Frontend                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Street   │  │  Telemetry   │  │ AI Chat   │  │
│  │ Sim View │  │  Dashboard   │  │ (RAG UI)  │  │
│  └──────────┘  └──────────────┘  └───────────┘  │
│        ↕ WebSocket       ↕ REST        ↕ REST   │
├─────────────────────────────────────────────────┤
│           .NET 10 Backend (C#)                  │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Simulation   │  │ Telemetry API          │   │
│  │ Engine       │  │ (REST + WebSocket)     │   │
│  │ (time-step)  │  │                        │   │
│  └──────────────┘  └────────────────────────┘   │
│        ↕ writes              ↕ reads            │
│  ┌──────────────────────────────────────────┐   │
│  │         SQLite (telemetry storage)       │   │
│  └──────────────────────────────────────────┘   │
│                      ↕ reads                    │
├─────────────────────────────────────────────────┤
│          Python AI Service (FastAPI)            │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ RAG Pipeline │  │ Anomaly Detection      │   │
│  │ (FAISS +     │  │ (rule-based + LLM      │   │
│  │  embeddings) │  │  summarization)        │   │
│  └──────────────┘  └────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend:** Angular 21 with TypeScript, standalone components, HTML5 Canvas, ECharts (ngx-echarts), SignalR client
- **Backend:** C# / .NET 10 minimal API, Entity Framework Core with SQLite, SignalR for WebSocket
- **AI Service:** Python 3.11+, FastAPI, sentence-transformers for embeddings, FAISS for vector search
- **LLM:** OpenAI-compatible API (user will configure key) OR rule-based demo mode
- **Containerization:** Docker Compose to run all three services

## Directory Structure

```
cognilight/
├── docker-compose.yml
├── README.md
├── frontend/                    # Angular app
│   ├── src/
│   │   ├── app/
│   │   │   ├── simulation/      # Street view component (HTML5 Canvas)
│   │   │   │   ├── renderer/    # Modular canvas renderer
│   │   │   │   │   ├── theme.ts             # Canvas color constants (RT)
│   │   │   │   │   ├── world-layout.ts      # Roads, buildings, poles definitions
│   │   │   │   │   ├── entity-manager.ts    # Entity lifecycle (spawn/fade)
│   │   │   │   │   ├── iso-projection.ts    # World-to-screen projection
│   │   │   │   │   └── layers/              # Draw layers (ground, buildings, entities, poles, overlays)
│   │   │   │   ├── simulation.renderer.ts   # Orchestrator
│   │   │   │   ├── simulation.component.ts
│   │   │   │   ├── simulation.component.html
│   │   │   │   └── simulation.component.scss
│   │   │   ├── dashboard/       # Telemetry dashboard component
│   │   │   ├── chat/            # AI chat component (floating panel)
│   │   │   ├── home/            # Layout: sim + dashboard side-by-side
│   │   │   ├── shared/
│   │   │   │   ├── models/      # TelemetryReading model
│   │   │   │   ├── services/    # TelemetryService (SignalR), LayoutService
│   │   │   │   └── chart-theme.ts  # ECharts color constants (CT)
│   │   │   ├── theme.scss       # CSS custom properties (single source of truth)
│   │   │   ├── app.ts / app.html / app.scss
│   │   │   └── app.routes.ts
│   │   └── styles.scss
│   ├── angular.json
│   └── Dockerfile
├── backend/                     # .NET 10 API
│   ├── CogniLight.Api/
│   │   ├── Program.cs
│   │   ├── Models/
│   │   │   ├── TelemetryReading.cs
│   │   │   └── IncidentLog.cs       # Free-text maintenance/incident reports
│   │   ├── Services/
│   │   │   ├── SimulationEngine.cs  # IHostedService with per-pole zone activity
│   │   │   ├── TelemetryService.cs
│   │   │   └── IncidentLogGenerator.cs  # Generates incident logs from anomalies + scheduled
│   │   ├── Hubs/
│   │   │   └── TelemetryHub.cs  # SignalR hub
│   │   └── Data/
│   │       └── AppDbContext.cs
│   ├── CogniLight.Api.csproj
│   └── Dockerfile
├── ai-service/                  # Python FastAPI
│   ├── main.py
│   ├── constants.py             # Shared POLE_ZONES, TELEMETRY_COLUMNS
│   ├── rag/
│   │   ├── embeddings.py
│   │   ├── retriever.py
│   │   ├── chain.py             # Hybrid SQL+RAG prompt builder, LLM streaming
│   │   ├── sql_context.py       # Direct SQLite queries for current state
│   │   └── narrative.py         # Incident log ingestion into FAISS
│   ├── anomaly/
│   │   └── detector.py
│   ├── requirements.txt
│   └── Dockerfile
└── docs/
    └── architecture.md
```

## Simulation Design

### The Street Scene
- Top-down 2D view of a city block rendered on HTML5 Canvas
- ~12 light poles positioned along two parallel streets with an intersection
- Each pole has a visible sensor radius (circle overlay, semi-transparent)
- Moving entities: pedestrians (small dots/icons), cars (rectangles), cyclists (smaller rectangles)
- Time-of-day cycle: sky color shifts, lighting cones appear at night, entity density varies
- Time controls: play/pause, speed multiplier (1x, 2x, 5x, 10x), time-of-day display

### Entity Behavior
- Each pole has a ZoneType (Office, Retail, Park, School, Mall, Apt, Cafe, Gym, Residence, Mixed, Tower, Hotel) that determines its activity profile
- Activity multipliers vary by time of day (e.g., Office: busy 8-18h, dead at night; Hotel: steady all day)
- Entities spawn near poles and fade in/out based on backend telemetry counts
- Pedestrians appear on sidewalks, vehicles/cyclists on road segments within the pole's zone radius

### Per-Pole Telemetry (generated each simulation tick, ~1 second):
- `pole_id` (string): "POLE-01" through "POLE-12"
- `timestamp` (ISO 8601)
- `energy_watts` (float): power consumption, 50-250W range, adaptive dimming at night
- `pedestrian_count` (int): entities within sensor radius
- `vehicle_count` (int): vehicles within sensor radius
- `cyclist_count` (int): cyclists within sensor radius
- `ambient_light_lux` (float): 0-100000, follows time-of-day curve
- `temperature_c` (float): 15-35°C with daily cycle
- `humidity_pct` (float): 40-80%
- `air_quality_aqi` (int): 20-150, spikes with traffic density
- `noise_db` (float): 30-85, correlates with traffic
- `light_level_pct` (float): 0-100%, adaptive dimming output
- `anomaly_flag` (bool): occasional random anomalies (flickering, sensor malfunction)

### Anomaly Scenarios (~0.3% chance per pole per tick, context-aware):
- Pedestrian cluster — only flagged when the zone should be quiet (e.g., school at night)
- Sudden energy spike — hardware malfunction, can happen anytime
- Sensor dropout — null readings, can happen anytime
- Air quality spike — flagged when uncorrelated with traffic density

## Dashboard Design

### Layout
Side-by-side with the street simulation (sim left 45%, dashboard right 55%). The sim panel is collapsible via a Map/Dashboard toggle in the nav bar. Dashboard uses a grid of cards/panels:

**Row 1 — Aggregate KPIs:**
- Total energy consumption (all poles, real-time)
- Total pedestrian count across network
- Total vehicle count
- Average air quality index
- Active anomalies count (with alert badge)

**Row 2 — Time-Series Charts:**
- Energy consumption over time (line chart, stacked by pole or aggregated)
- Traffic density over time (pedestrians + vehicles + cyclists, area chart)
- Environmental conditions (temperature, humidity, AQI — multi-axis line chart)

**Row 3 — Per-Pole Detail:**
- Selectable pole table/grid showing current readings
- Click a pole on the street view OR in the table to see its individual charts
- Anomaly log: timestamped list of detected anomalies with severity

### Chart Library
Use a well-supported Angular charting library: ngx-charts, Chart.js with ng2-charts, or Apache ECharts with ngx-echarts. Prefer ECharts for its real-time streaming capability.

## AI Chat Panel

### UI
- Floating action button (bottom-right) opens a chat panel
- Chat message interface with user/assistant bubbles
- Suggested prompts: "Summarize the last hour", "Which poles are consuming the most energy?", "Any anomalies detected?", "Compare traffic between morning and evening"

### Hybrid SQL + RAG Pipeline
The AI chat uses two context sources:
1. **Direct SQL** (every query): Queries SQLite for current network state — per-pole snapshot, rankings, recent anomalies. Always included in the LLM prompt.
2. **RAG over incident logs** (when relevant): Free-text maintenance/incident reports from technicians and automated systems are embedded (sentence-transformers/all-MiniLM-L6-v2) and stored in FAISS. Semantic search retrieves relevant logs for maintenance/incident queries.

Query routing: `_needs_rag()` in `chain.py` classifies queries by keyword heuristic — maintenance/incident keywords trigger RAG, everything else uses SQL context only.

Key files:
- `ai-service/rag/sql_context.py` — Direct DB queries for current state
- `ai-service/rag/chain.py` — Query classifier, prompt builder, LLM streaming
- `ai-service/rag/retriever.py` — FAISS vector search
- `ai-service/rag/narrative.py` — Incident log ingestion into FAISS
- `ai-service/constants.py` — Shared POLE_ZONES and column definitions

### Demo Mode (no API key)
- If no LLM API key is configured, use pre-canned responses that demonstrate the interface
- Alternatively, use a small local model or rule-based response generation

## Visual Design

**Aesthetic: Industrial/utilitarian control room UI — dark theme throughout.**
- Dark theme (charcoal/navy background, NOT pure black)
- Accent color: warm amber (#F59E0B) — evokes street lighting
- Secondary accent: cool teal/cyan (#06B6D4, #22d3ee) — for data/digital elements
- Status indicators: green (normal), amber (warning), red (anomaly)
- Glow effects on active poles at night

**Theming is centralized across three files:**
1. `frontend/src/app/theme.scss` — CSS custom properties for all SCSS-based components (single source of truth)
2. `frontend/src/app/simulation/renderer/theme.ts` — TypeScript `RT` const for canvas renderer (can't read CSS vars)
3. `frontend/src/app/shared/chart-theme.ts` — TypeScript `CT` const + helpers for ECharts options (JS objects, not CSS)

To change the theme, edit these three files. All component styles reference CSS variables (`var(--cl-*)`).

## Development Phases

### Phase 1: Project Scaffolding & Simulation Engine
1. Set up Angular project with routing (3 main views or single-page sections)
2. Set up .NET 10 minimal API project with SQLite + EF Core
3. Set up Python FastAPI project with placeholder endpoints
4. Docker Compose for all three + volume for SQLite
5. Implement SimulationEngine in C# — time-step loop generating telemetry data
6. Store telemetry in SQLite via EF Core
7. SignalR hub broadcasting latest telemetry each tick

### Phase 2: Street Simulation View
1. Angular component with HTML5 Canvas
2. Render street layout (roads, sidewalks, buildings as rectangles, pole positions)
3. Animate entities (pedestrians, vehicles, cyclists) with basic movement patterns
4. Pole sensor radius visualization
5. Time-of-day lighting effects
6. Connect to SignalR to receive simulation state updates
7. Click-to-select pole interaction

### Phase 3: Telemetry Dashboard
1. KPI summary cards with real-time values from SignalR
2. Time-series charts (ECharts) updating in real-time
3. Per-pole detail view (click pole → see its charts)
4. Anomaly log panel
5. Responsive grid layout

### Phase 4: AI Service & Chat
1. Python service reads from SQLite, generates text summaries
2. Embedding + FAISS indexing of summaries
3. RAG retrieval endpoint
4. Chat UI in Angular
5. Demo mode fallback

### Phase 5: Polish & Documentation
1. Loading states, error handling, empty states
2. README with screenshots, architecture diagram, setup instructions
3. Smooth animations and transitions
4. Code cleanup, comments on key decisions

## Incident Log System

The backend generates realistic free-text maintenance/incident reports via `IncidentLogGenerator`:
- **Anomaly follow-ups** (~40% of anomalies): Technician responds to energy spike, sensor dropout, crowd cluster, or AQI alert with detailed findings and actions taken.
- **Scheduled entries** (every ~2 hours): Routine inspections, predictive maintenance flags, sensor cleaning, automated diagnostics.
- Stored in `IncidentLogs` SQLite table, broadcast via SignalR `IncidentLog` event.
- Displayed in dashboard side panel (separate from anomaly log).
- Ingested into FAISS by the Python AI service for RAG semantic search.

## Key Implementation Notes

- **EF Core `EnsureCreated()` limitation**: Won't add new tables to an existing DB. When adding new entities, also add `CREATE TABLE IF NOT EXISTS` in Program.cs startup.
- **SQLite timestamp format**: .NET writes `2026-03-19 22:53:10.1797267` (space-separated, 7-digit fractional). Python `%f` only handles 6 digits — truncate before parsing.
- **Anomaly detector key casing**: `anomaly/detector.py` expects camelCase keys; SQLite columns are PascalCase. Normalize when passing readings to `detect_anomalies()`.
- **Real-time data pattern**: All live data flows through SignalR (telemetry, anomalies, incident logs). Never poll for data that can be pushed. REST is only for historical range queries.
- **Backend log noise**: EF Core and SignalR log at Information level every tick. Filtered in Program.cs via `builder.Logging.AddFilter()`.
- The simulation engine should run as a hosted background service in .NET (IHostedService)
- Use SignalR for real-time telemetry push — NOT polling
- The Angular app should use RxJS extensively for reactive data streams
- Keep the SQLite database small — consider purging data older than N simulation-hours
- The Python service connects to the SAME SQLite file (read-only) or queries the .NET API
- All API communication between services uses JSON
- For the canvas rendering, use requestAnimationFrame and keep the entity state synchronized with the backend simulation state

## Quality Standards
- TypeScript strict mode in Angular
- Proper C# nullable reference types
- Python type hints throughout
- Error handling on all API calls
- No hardcoded values — use configuration/environment variables
- Clean git commit messages following conventional commits