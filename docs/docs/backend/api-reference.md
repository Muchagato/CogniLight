# API Reference — Backend

All REST endpoints are defined in `Program.cs` under the `/api` group. The SignalR hub is at `/hubs/telemetry`.

---

## REST Endpoints

### Telemetry

#### `GET /api/telemetry/latest`

Returns the most recent reading for each of the 12 poles.

**Response:** `TelemetryReading[]`

```json
[
  {
    "id": 45231,
    "poleId": "POLE-01",
    "timestamp": "2026-03-20T14:23:01.123Z",
    "energyWatts": 142.3,
    "pedestrianCount": 3,
    "vehicleCount": 2,
    "cyclistCount": 1,
    "ambientLightLux": 85432.1,
    "temperatureC": 24.7,
    "humidityPct": 52.3,
    "airQualityAqi": 46,
    "noiseDb": 48.2,
    "lightLevelPct": 12.5,
    "anomalyFlag": false,
    "anomalyDescription": null
  }
]
```

---

#### `GET /api/telemetry/{poleId}`

Returns the last 100 readings for a specific pole.

**Parameters:**

| Name | Type | In | Description |
|------|------|-----|-------------|
| `poleId` | string | path | e.g. `POLE-01` |

**Response:** `TelemetryReading[]`

---

#### `GET /api/telemetry/anomalies`

Returns the 50 most recent anomaly readings across all poles.

**Response:** `TelemetryReading[]` (filtered to `anomalyFlag == true`)

---

#### `GET /api/telemetry/history`

Returns aggregated network-wide telemetry bucketed by time.

**Parameters:**

| Name | Type | In | Description |
|------|------|-----|-------------|
| `from` | string | query | ISO 8601 start time |
| `to` | string | query | ISO 8601 end time |
| `bucketSeconds` | int | query | Bucket size in seconds |

**Response:** `AggregatedBucket[]`

```json
[
  {
    "bucketStart": "2026-03-20T14:00:00Z",
    "totalEnergy": 1523.4,
    "totalPedestrians": 12.3,
    "totalVehicles": 8.1,
    "totalCyclists": 2.5,
    "avgTemperature": 24.2,
    "avgHumidity": 53.1,
    "avgAqi": 48.0,
    "avgNoise": 52.3,
    "anomalyCount": 0
  }
]
```

!!! note "Aggregation method"
    `totalEnergy`, `totalPedestrians`, `totalVehicles`, `totalCyclists` are per-tick sums averaged across the bucket. See [Telemetry Service](telemetry-service.md#the-two-pass-cte) for the two-pass CTE explanation.

---

#### `GET /api/telemetry/history/{poleId}`

Returns aggregated telemetry for a single pole.

**Parameters:**

| Name | Type | In | Description |
|------|------|-----|-------------|
| `poleId` | string | path | e.g. `POLE-01` |
| `from` | string | query | ISO 8601 start time |
| `to` | string | query | ISO 8601 end time |
| `bucketSeconds` | int | query | Bucket size in seconds |

**Response:** `PoleBucket[]`

```json
[
  {
    "bucketStart": "2026-03-20T14:00:00Z",
    "avgEnergy": 142.3,
    "avgPedestrians": 3.2,
    "avgVehicles": 1.8,
    "avgCyclists": 0.4,
    "avgAqi": 46,
    "avgNoise": 48.2,
    "avgTemperature": 24.7,
    "avgHumidity": 52.3,
    "avgLightLevel": 12.5,
    "anomalyCount": 0
  }
]
```

---

#### `GET /api/telemetry/anomalies/range`

Returns anomalies within a specific time range.

**Parameters:**

| Name | Type | In | Description |
|------|------|-----|-------------|
| `from` | string | query | ISO 8601 start time |
| `to` | string | query | ISO 8601 end time |
| `limit` | int? | query | Max results (default: 200) |

**Response:**

```json
[
  {
    "time": "2026-03-20T14:23:01.123Z",
    "poleId": "POLE-07",
    "description": "Sudden energy spike on POLE-07 — possible malfunction"
  }
]
```

---

### Incidents

#### `GET /api/incidents`

Returns incident log entries, optionally filtered by time range.

**Parameters:**

| Name | Type | In | Description |
|------|------|-----|-------------|
| `limit` | int? | query | Max results (default: 50) |
| `from` | string? | query | ISO 8601 start time |
| `to` | string? | query | ISO 8601 end time |

**Response:**

```json
[
  {
    "id": 42,
    "timestamp": "2026-03-20T14:25:00Z",
    "poleId": "POLE-07",
    "author": "Technician Silva",
    "category": "repair",
    "text": "Investigated energy spike at POLE-07. Lamp driver board showing signs of capacitor degradation..."
  }
]
```

---

### Simulation

#### `GET /api/simulation/status`

Returns the current simulation time.

```json
{ "time": "2026-03-20T14:23:01Z" }
```

---

#### `GET /api/simulation/poles`

Returns the static pole layout (positions and IDs).

```json
[
  { "poleId": "POLE-01", "x": 0.22, "y": 0.12 },
  { "poleId": "POLE-02", "x": 0.22, "y": 0.35 },
  ...
]
```

---

## SignalR Hub

**Endpoint:** `/hubs/telemetry`

The hub class itself is empty — all broadcasting is done via `IHubContext<TelemetryHub>` from background services.

### Events (Server → Client)

#### `TelemetryUpdate`

Fired every second by `SimulationEngine`.

```json
{
  "simulationTime": "2026-03-20T14:23:01.123Z",
  "readings": [
    { "poleId": "POLE-01", "energyWatts": 142.3, ... },
    ...
  ]
}
```

#### `IncidentLog`

Fired by `IncidentLogGenerator` when a new log is created.

```json
{
  "id": 42,
  "timestamp": "2026-03-20T14:25:00Z",
  "poleId": "POLE-07",
  "author": "Technician Silva",
  "category": "repair",
  "text": "Investigated energy spike..."
}
```

### Connection

The frontend connects using the `@microsoft/signalr` package with automatic reconnection:

```typescript
this.hubConnection = new signalR.HubConnectionBuilder()
  .withUrl('/hubs/telemetry')
  .withAutomaticReconnect()
  .build();
```

In Docker mode, the connection URL `/hubs/telemetry` is proxied by Nginx to `backend:5000`. In development, Angular's dev server proxy handles it.
