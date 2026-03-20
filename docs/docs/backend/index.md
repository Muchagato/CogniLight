# Backend (.NET 10)

The backend is the heart of CogniLight. It generates simulated telemetry, persists it, and pushes it to connected clients in real time. It's built with .NET 10's minimal API pattern — no controllers, no MVC, just a single `Program.cs` that wires everything together.

---

## Key Design Choices

- **Minimal API** over controllers: For a handful of endpoints, the minimal API style is more readable and eliminates boilerplate. Each endpoint is a single lambda in `Program.cs`.
- **`IHostedService` for background work**: Both `SimulationEngine` and `IncidentLogGenerator` run as hosted background services, started automatically by the .NET host and gracefully stopped on shutdown.
- **Singleton services**: `SimulationEngine`, `TelemetryService`, and `IncidentLogGenerator` are registered as singletons because they maintain state (pole states, pending anomalies, etc.) across the application lifetime.
- **Scoped `DbContext`**: EF Core's `AppDbContext` is scoped (the default), but singleton services can't inject scoped services directly. So `TelemetryService` takes an `IServiceScopeFactory` and creates scopes on demand.

---

## Project Structure

```
backend/CogniLight.Api/
├── Program.cs                    # Startup, DI, endpoints, middleware
├── CogniLight.Api.csproj         # .NET 10, EF Core SQLite, SignalR
├── Models/
│   ├── TelemetryReading.cs       # Per-pole telemetry entity (14 fields)
│   └── IncidentLog.cs            # Free-text incident report entity
├── Services/
│   ├── SimulationEngine.cs       # Background service: generates telemetry
│   ├── TelemetryService.cs       # Data access: save, query, aggregate
│   └── IncidentLogGenerator.cs   # Background service: generates incident logs
├── Hubs/
│   └── TelemetryHub.cs           # SignalR hub (empty — all broadcast via IHubContext)
├── Data/
│   └── AppDbContext.cs            # EF Core context (2 entities, indexed)
└── Dockerfile                    # Multi-stage build: SDK → runtime
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `Microsoft.EntityFrameworkCore.Sqlite` | 10.0.5 | SQLite provider for EF Core |
| `Microsoft.EntityFrameworkCore.Design` | 10.0.5 | Design-time EF Core tooling |
| `Microsoft.AspNetCore.OpenApi` | 10.0.5 | OpenAPI spec generation (dev only) |
| `Microsoft.AspNetCore.RateLimiting` | 10.0.5 | Rate limiting middleware (available, not yet configured) |

SignalR is included in the `Microsoft.NET.Sdk.Web` SDK — no additional package needed.

---

## Startup Flow

`Program.cs` does the following in order:

1. **Configure logging** — Suppress noisy EF Core and SignalR logs at `Information` level. Without this, every tick produces ~15 log lines from EF Core's `Database.Command` and `Update` categories.

2. **Register services** — `SimulationEngine`, `TelemetryService`, `IncidentLogGenerator`, SignalR, CORS.

3. **Configure CORS** — Origins are read from the `CORS_ORIGINS` environment variable (comma-separated). Falls back to `http://localhost:4200` for development.

4. **Build the app** — Then immediately:
    - `EnsureCreated()` to create the SQLite database and tables
    - Manual `CREATE TABLE IF NOT EXISTS` for `IncidentLogs` (because `EnsureCreated()` won't add tables to an existing DB)
    - Prune telemetry older than 3 days

5. **Map endpoints** — REST endpoints under `/api/`, SignalR hub at `/hubs/telemetry`, OpenAPI at `/openapi` (dev only).

6. **Start** — The hosted services (`SimulationEngine`, `IncidentLogGenerator`) begin ticking automatically.

---

## Data Model

### TelemetryReading

Each reading represents one pole's sensor output at one moment in time:

| Field | Type | Description |
|-------|------|-------------|
| `Id` | `long` | Auto-increment primary key |
| `PoleId` | `string` | "POLE-01" through "POLE-12" |
| `Timestamp` | `DateTime` | UTC timestamp of the reading |
| `EnergyWatts` | `double` | Power consumption (50–250W) |
| `PedestrianCount` | `int` | Pedestrians in sensor radius |
| `VehicleCount` | `int` | Vehicles in sensor radius |
| `CyclistCount` | `int` | Cyclists in sensor radius |
| `AmbientLightLux` | `double` | Solar light level (0–100,000 lux) |
| `TemperatureC` | `double` | Temperature (15–35°C) |
| `HumidityPct` | `double` | Relative humidity (40–80%) |
| `AirQualityAqi` | `int` | Air Quality Index (20–150) |
| `NoiseDb` | `double` | Noise level (30–85 dB) |
| `LightLevelPct` | `double` | Adaptive dimming output (0–100%) |
| `AnomalyFlag` | `bool` | Whether this reading is anomalous |
| `AnomalyDescription` | `string?` | Human-readable anomaly description |

Indexed on `PoleId` and `Timestamp` for efficient querying.

### IncidentLog

Free-text maintenance and incident reports:

| Field | Type | Description |
|-------|------|-------------|
| `Id` | `long` | Auto-increment primary key |
| `Timestamp` | `DateTime` | When the log was created |
| `PoleId` | `string` | Which pole it relates to |
| `Author` | `string` | "Technician Silva", "AutoDiag System", etc. |
| `Category` | `string` | One of: maintenance, inspection, incident, repair, scheduled |
| `Text` | `string` | The full narrative (up to 1024 chars) |

---

## What's Next

- [Simulation Engine](simulation-engine.md) — how telemetry is generated
- [Telemetry Service](telemetry-service.md) — data access and aggregation queries
- [Incident Log System](incident-logs.md) — realistic maintenance report generation
- [API Reference](api-reference.md) — all REST and SignalR endpoints
