# API Reference — AI Service

All endpoints are defined in `main.py`. The service runs on port 8000 by default.

---

## Health & Status

### `GET /health`

Returns service health and FAISS index size.

```json
{
  "status": "ok",
  "service": "ai-service",
  "index_size": "42"
}
```

### `GET /api/chat/status`

Returns the chat service configuration mode.

```json
{
  "configured": true,
  "mode": "byok"
}
```

---

## Chat

### `POST /api/chat`

Non-streaming chat endpoint. Returns the complete response at once.

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `X-LLM-API-Key` | Yes | LLM provider API key |
| `X-LLM-Provider` | No | `anthropic` (default) or `openai` |
| `X-LLM-Model` | No | Model override (e.g., `claude-sonnet-4-5-20250514`) |

**Request Body:**

```json
{
  "message": "Which poles consume the most energy?"
}
```

**Response:**

```json
{
  "reply": "Based on the current readings, the top energy consumers are...",
  "sources": [
    "[REPAIR] Technician Silva — Investigated energy spike at POLE-07..."
  ]
}
```

---

### `POST /api/chat/stream`

Streaming chat endpoint. Returns an SSE stream with structured events.

**Headers:** Same as `/api/chat`.

**Request Body:** Same as `/api/chat`.

**SSE Events:**

#### `sql_context`

Always emitted first. Contains the SQL queries run and their results.

```json
{
  "queries": [
    {
      "label": "Latest reading per pole",
      "query": "SELECT * FROM TelemetryReadings WHERE Id IN (...)",
      "rowCount": 12,
      "columns": ["Pole", "Zone", "Energy", "Ped", "Veh", "Cyc", "AQI", "Temp", "Noise", "Light%", "Anomaly"],
      "rows": [
        ["POLE-01", "Office", "142W", 3, 2, 1, 46, "24.7", "48", "13%", "-"],
        ...
      ]
    },
    {
      "label": "Recent anomalies",
      "query": "SELECT PoleId, Timestamp, AnomalyDescription FROM ...",
      "rowCount": 5,
      "columns": ["Pole", "Timestamp", "Description"],
      "rows": [...]
    }
  ]
}
```

#### `sources`

Emitted only if RAG is triggered (query contains maintenance/incident keywords).

```json
{
  "sources": [
    {
      "text": "[REPAIR] Technician Silva — Investigated energy spike at POLE-07...",
      "timestamp": "2026-03-20 14:25:00",
      "poleIds": ["POLE-07"]
    }
  ]
}
```

#### `token`

Emitted for each text chunk from the LLM.

```json
{
  "text": "Based on"
}
```

#### `done`

Emitted when the response is complete.

```json
{}
```

---

## Anomalies

### `GET /api/anomalies/summary`

Returns a text summary of recent anomalies.

```json
{
  "summary": "Anomaly Summary: 12 total detected.\n  HIGH (2): POLE-07 - Sudden energy spike..."
}
```

### `GET /api/anomalies/recent`

Returns the 20 most recent anomaly reports.

```json
[
  {
    "poleId": "POLE-07",
    "timestamp": "2026-03-20 14:23:01",
    "type": "energy_spike",
    "description": "Sudden energy spike on POLE-07 — possible malfunction",
    "severity": "high"
  }
]
```

---

## Suggestions

### `GET /api/chat/suggestions`

Returns suggested prompts for the chat UI.

```json
[
  "Summarize the last hour of telemetry",
  "Which poles are consuming the most energy right now?",
  "Any maintenance issues or incidents reported recently?",
  "Have there been any recurring sensor problems?",
  "What's the current air quality across the network?",
  "Which poles have had repairs done?"
]
```

---

## CORS Configuration

The AI service allows CORS from origins specified in the `CORS_ORIGINS` environment variable (comma-separated). Defaults to `*` (all origins) if not set.

Allowed headers include the BYOK headers:

```python
allow_headers=["Content-Type", "X-LLM-API-Key", "X-LLM-Provider", "X-LLM-Model"]
```

In the Docker setup, CORS is not needed because Nginx proxies all requests through the frontend's origin.
