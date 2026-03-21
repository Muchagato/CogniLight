# Telemetry Service

`TelemetryService` (`Services/TelemetryService.cs`) is the data access layer for telemetry readings. It handles persistence, querying, aggregation, and data retention.

---

## Design: Singleton with Scoped DbContext

`TelemetryService` is registered as a singleton, but EF Core's `AppDbContext` is scoped (created per-request). Since a singleton can't inject a scoped service directly, the service uses `IServiceScopeFactory`:

```csharp
public class TelemetryService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public async Task SaveReadingsAsync(IEnumerable<TelemetryReading> readings)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.TelemetryReadings.AddRange(readings);
        await db.SaveChangesAsync();
    }
}
```

Every method creates a new scope, gets a fresh `DbContext`, does its work, and disposes the scope. This avoids the common pitfall of a singleton holding a stale DbContext.

---

## Data Retention

Rather than running a scheduled cleanup job, the service piggybacks on the write path:

```csharp
// Prune data older than 3 days (run every ~100 ticks to avoid per-tick overhead)
if (Random.Shared.Next(100) == 0)
{
    var cutoff = DateTime.UtcNow.AddDays(-3);
    await db.TelemetryReadings
        .Where(r => r.Timestamp < cutoff)
        .ExecuteDeleteAsync();
    await db.IncidentLogs
        .Where(l => l.Timestamp < cutoff)
        .ExecuteDeleteAsync();
}
```

This fires roughly every 100 seconds (1% chance per tick). The `ExecuteDeleteAsync()` calls translate to single SQL `DELETE` statements — no entities are loaded into memory. Both telemetry readings and incident logs share the same 3-day retention window.

An additional startup pruning runs in `Program.cs` to catch up after any downtime.

---

## Aggregation Queries

The most complex query is `GetAggregatedHistoryAsync`, which buckets telemetry into time windows for chart display. It uses raw SQL via a CTE (Common Table Expression) because this kind of epoch-based bucketing is difficult to express in LINQ.

### The Two-Pass CTE

```sql
WITH TickAgg AS (
    SELECT
        CAST(strftime('%s', Timestamp) AS INTEGER) AS Epoch,
        SUM(EnergyWatts) AS Energy,
        SUM(PedestrianCount) AS Ped,
        ...
    FROM TelemetryReadings
    WHERE Timestamp >= @from AND Timestamp <= @to
    GROUP BY Epoch
)
SELECT
    (Epoch / @bucket) * @bucket AS BucketEpoch,
    AVG(Energy) AS TotalEnergy,
    AVG(Ped) AS TotalPedestrians,
    ...
FROM TickAgg
GROUP BY BucketEpoch
ORDER BY BucketEpoch
```

**Why two passes?**

The simulation generates 12 readings per second (one per pole). If we bucketed directly with SUM, a 10-second bucket would contain 120 readings (12 poles × 10 seconds), giving an energy value 10x higher than reality.

The CTE solves this:

1. **TickAgg:** Groups by epoch second and SUMs across poles → gives the per-tick network total
2. **Outer query:** Buckets the per-tick totals and AVERAGEs → gives the representative value for each bucket

!!! tip "Why AVG instead of SUM in the outer query?"
    We use `AVG` because each row in TickAgg already represents the total for one tick. Averaging across ticks in a bucket gives the representative "what did the network look like during this period" value, not the cumulative sum.

### Bucket Sizes

The frontend requests different bucket sizes based on the selected time range:

| Time Range | Bucket Size | Typical Data Points |
|-----------|-------------|-------------------|
| LIVE | N/A (raw) | 120 snapshots (in-memory) |
| 5 minutes | 1 second | ~300 points |
| 15 minutes | 5 seconds | ~180 points |
| 1 hour | 10 seconds | ~360 points |
| 6 hours | 60 seconds | ~360 points |
| 1 day | 300 seconds (5 min) | ~288 points |
| 3 days | 900 seconds (15 min) | ~288 points |

### Per-Pole History

`GetPoleHistoryAsync` uses a simpler single-pass query because it only operates on one pole's data (no cross-pole aggregation needed):

```sql
SELECT
    (CAST(strftime('%s', Timestamp) AS INTEGER) / @bucket) * @bucket AS BucketEpoch,
    AVG(EnergyWatts) AS AvgEnergy,
    AVG(PedestrianCount) AS AvgPedestrians,
    ...
FROM TelemetryReadings
WHERE PoleId = @poleId AND Timestamp >= @from AND Timestamp <= @to
GROUP BY BucketEpoch
ORDER BY BucketEpoch
```

---

## Query Methods Summary

| Method | Returns | Used By |
|--------|---------|---------|
| `SaveReadingsAsync` | void | SimulationEngine (every tick) |
| `GetLatestReadingsAsync` | Latest reading per pole | REST: `GET /api/telemetry/latest` |
| `GetReadingsByPoleAsync` | Last N readings for one pole | REST: `GET /api/telemetry/{poleId}` |
| `GetAnomaliesAsync` | Recent anomaly readings | REST: `GET /api/telemetry/anomalies` |
| `GetAggregatedHistoryAsync` | Bucketed network totals | REST: `GET /api/telemetry/history` |
| `GetPoleHistoryAsync` | Bucketed single-pole data | REST: `GET /api/telemetry/history/{poleId}` |
| `GetAnomaliesInRangeAsync` | Anomalies in a time range | REST: `GET /api/telemetry/anomalies/range` |

---

## EF Core Configuration

The `AppDbContext` configures both entities with indexes for the most common query patterns:

```csharp
modelBuilder.Entity<TelemetryReading>(entity =>
{
    entity.HasKey(e => e.Id);
    entity.HasIndex(e => e.PoleId);      // Filter by pole
    entity.HasIndex(e => e.Timestamp);    // Range queries
});
```

The `IncidentLogs` table has equivalent indexes, plus additional manual indexes created via raw SQL in `Program.cs` (because `EnsureCreated()` won't add indexes to existing tables either).
