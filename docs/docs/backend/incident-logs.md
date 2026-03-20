# Incident Log System

`IncidentLogGenerator` (`Services/IncidentLogGenerator.cs`) creates realistic free-text maintenance and incident reports. These serve two purposes: they populate the dashboard's incident log panel, and they provide narrative context for the AI chat's RAG pipeline.

---

## Why Incident Logs?

Telemetry data answers "what is happening?" but not "what was done about it?" In a real smart lighting platform, maintenance crews file reports when they respond to alerts. These reports contain details that structured data can't capture:

> "Found corroded wiring at junction box. Applied temporary fix, scheduled full rewiring for next maintenance window."

The AI service embeds these reports into a FAISS vector index, enabling semantic queries like "have there been any recurring sensor problems?" — a question that structured telemetry alone can't answer.

---

## Generation Sources

### Anomaly Follow-Ups (~40% of anomalies)

When the `SimulationEngine` generates an anomaly, it calls:

```csharp
_incidentLogGenerator.OnAnomalyDetected(timestamp, poleId, anomalyDesc);
```

The generator queues this with a ~40% probability. Queued anomalies are processed in the next tick (30-second interval) after a minimum 1-minute delay — simulating the time it takes for a technician to respond.

Each anomaly type has multiple template responses:

| Anomaly Type | Category | Example Author | Example Text |
|-------------|----------|---------------|-------------|
| Energy spike | `repair` | Technician Silva | "Traced to loose neutral connection in the panel. Retightened all terminals..." |
| Pedestrian cluster | `incident` | Control Room Operator | "Coordinated with municipal security — confirmed unauthorized gathering..." |
| Sensor dropout | `maintenance` | Technician Ferreira | "PIR sensor lens had micro-cracks from UV exposure. Replaced with UV-resistant unit..." |
| AQI spike | `incident` | AutoDiag System | "Cross-referenced with city environmental monitoring: localized event, not regional..." |

### Scheduled Entries (every ~2 hours)

Independent of anomalies, the generator creates routine entries:

| Type | Category | Author | Example |
|------|----------|--------|---------|
| Routine inspection | `inspection` | Technician (random) | "Lamp housing in good condition. Sensor calibration verified..." |
| Predictive maintenance | `scheduled` | Predictive Maintenance AI | "Current lamp has 9,847 operating hours (rated for 15,000)..." |
| Sensor cleaning | `maintenance` | Technician (random) | "Ambient light sensor had dust accumulation affecting readings by ~7%..." |
| Automated diagnostics | `scheduled` | AutoDiag System | "Communication latency 8ms. Power factor 0.96. LED driver efficiency 93%..." |

---

## Zone Context

The generator knows each pole's zone name, producing contextually appropriate reports:

```csharp
private static readonly Dictionary<string, string> PoleZoneNames = new()
{
    ["POLE-01"] = "office district",
    ["POLE-02"] = "retail strip",
    ["POLE-03"] = "park area",
    ...
};
```

This means reports reference "the retail strip" or "the school zone" rather than generic locations — making them more realistic and more useful for the AI's semantic search.

---

## Broadcast via SignalR

After saving to the database, each log is broadcast to connected clients:

```csharp
await _hubContext.Clients.All.SendAsync("IncidentLog", new
{
    log.Id, log.Timestamp, log.PoleId, log.Author, log.Category, log.Text
});
```

The frontend's `TelemetryService` listens for `IncidentLog` events and maintains a rolling buffer of the 50 most recent entries.

---

## Template Design

Each template is a complete, realistic narrative. The randomness comes from:

1. Which template is selected (from 4–5 options per anomaly type)
2. Random values within templates (e.g., operating hours, dust percentage, communication latency)
3. Random technician names (6 Portuguese surnames reflecting the project's context)
4. Random author type (40% technician, 60% automated system, varying by category)

The templates reference real-world maintenance concepts: capacitor degradation, UV-resistant lens replacements, firmware bugs, dielectric grease, PIR sensors — grounding the simulation in plausible smart lighting operations.
