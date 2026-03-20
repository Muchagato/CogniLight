# Anomaly Detection

The anomaly detection system in CogniLight operates at two levels: the backend *injects* anomalies during simulation, and the AI service *classifies* them for severity and type.

---

## Backend: Anomaly Injection

The `SimulationEngine` injects anomalies with a ~0.3% probability per pole per tick. This produces roughly one anomaly every 5 minutes across all 12 poles.

The injection is **context-aware** — not all anomaly types are valid at all times. See [Simulation Engine](../backend/simulation-engine.md#anomaly-injection) for the full candidate pool logic.

---

## AI Service: Anomaly Classification

`anomaly/detector.py` provides rule-based classification of anomalies from telemetry readings:

```python
@dataclass
class AnomalyReport:
    pole_id: str
    timestamp: str
    anomaly_type: str      # energy_spike, air_quality, crowd_cluster, sensor_issue
    description: str
    severity: str          # low, medium, high
```

### Classification Rules

| Condition | Type | Severity |
|-----------|------|----------|
| `energyWatts > 230` | `energy_spike` | High |
| `airQualityAqi > 120` | `air_quality` | High |
| `pedestrianCount > 30` | `crowd_cluster` | Medium |
| Everything else | `sensor_issue` | Low |

These rules are applied in priority order — the first matching condition wins.

### Key Casing Normalization

The anomaly detector expects **camelCase** keys (`poleId`, `energyWatts`), but SQLite columns are **PascalCase** (`PoleId`, `EnergyWatts`). The `main.py` ingestion code normalizes this:

```python
camel_readings = [
    {
        "poleId": r["PoleId"],
        "energyWatts": r["EnergyWatts"],
        "pedestrianCount": r["PedestrianCount"],
        ...
    }
    for r in readings
]
```

!!! warning "Why not normalize in the detector?"
    The detector was written to match the frontend's naming convention (camelCase JSON from the .NET API). Rather than change the detector's interface, the normalization happens at the ingestion boundary. This keeps the detector portable — it could process readings from either the database or the REST API.

---

## Anomaly Summary

The `summarize_anomalies()` function generates a text summary for the `/api/anomalies/summary` endpoint:

```
Anomaly Summary: 12 total detected.
  HIGH (2): POLE-07 - Sudden energy spike; POLE-03 - Air quality spike
  MEDIUM (3): POLE-04 - Unusual pedestrian cluster; ...
  LOW (7): 7 minor issues
```

High and medium anomalies get individual descriptions (top 3 of each). Low-severity anomalies are counted but not listed individually.

---

## Rolling Buffer

The service maintains a rolling buffer of the 100 most recent anomalies:

```python
_latest_anomalies: list[AnomalyReport] = []

new_anomalies = detect_anomalies(camel_readings)
if new_anomalies:
    _latest_anomalies = new_anomalies + _latest_anomalies
    _latest_anomalies = _latest_anomalies[:100]
```

New anomalies are prepended (newest first), and the buffer is capped at 100 entries.

---

## Relationship to Incident Logs

Anomaly detection and incident log generation are complementary:

- **Anomalies** are structured data: pole ID, type, severity, timestamp
- **Incident logs** are free-text narratives explaining what was done about the anomaly

The backend's `IncidentLogGenerator` is notified when an anomaly occurs and may create a follow-up log (40% probability). The AI service's RAG pipeline can then retrieve these logs when users ask about maintenance or incidents.

```
Anomaly → IncidentLog → FAISS → RAG retrieval → LLM response
```
