# Lessons Learned

Things that were tricky, surprising, or required iteration during development.

---

## EF Core `EnsureCreated()` Won't Add Tables to an Existing Database

**The problem:** After adding the `IncidentLog` entity to the DbContext, the `IncidentLogs` table wasn't being created. The application started fine but crashed when trying to write incident logs.

**Root cause:** `EnsureCreated()` checks if the database *file* exists. If it does, it assumes all tables are present and does nothing. It doesn't diff the model against the schema.

**The fix:** Add manual `CREATE TABLE IF NOT EXISTS` in `Program.cs`:

```csharp
db.Database.ExecuteSqlRaw("""
    CREATE TABLE IF NOT EXISTS IncidentLogs (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        Timestamp TEXT NOT NULL,
        PoleId TEXT NOT NULL,
        Author TEXT NOT NULL,
        Category TEXT NOT NULL,
        Text TEXT NOT NULL
    )
""");
```

**Lesson:** `EnsureCreated()` is fine for initial setup but breaks when you evolve the schema. In a longer-lived project, use EF Core Migrations instead. For this project, the manual DDL is simpler and more explicit.

---

## SQLite Timestamp Format Mismatch Between .NET and Python

**The problem:** Python's `datetime.strptime()` with `%f` (fractional seconds) only handles 6 digits. .NET writes timestamps with 7 fractional digits: `2026-03-19 22:53:10.1797267`.

**Root cause:** .NET's `DateTime` has 100-nanosecond precision (7 digits). Python's `datetime` has microsecond precision (6 digits).

**The fix:** The AI service reads timestamps as strings and doesn't parse them into Python datetime objects. When it needs to display them, it uses them as-is from SQLite.

**Lesson:** When two runtimes share a database, document the data format explicitly and test round-tripping early.

---

## SignalR + EF Core Log Noise

**The problem:** In development, the console was flooded with logs — every tick produced ~15 lines from EF Core's `Database.Command` category and SignalR's `Http.Connections` category.

**The fix:** Filtered in `Program.cs`:

```csharp
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Update", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.SignalR", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Http.Connections", LogLevel.Warning);
```

**Lesson:** For real-time applications that touch the database every second, configure logging filters early. The default `Information` level is too noisy.

---

## Canvas Animation and Angular Change Detection

**The problem:** The canvas animation loop was causing Angular to run change detection 60 times per second, even though no Angular bindings were changing (all drawing happens via Canvas 2D API).

**Root cause:** `requestAnimationFrame` callbacks run inside Angular's zone by default. Zone.js patches all browser APIs, including rAF.

**The fix:** Run the animation loop outside Angular's zone:

```typescript
this.zone.runOutsideAngular(() => this.renderer.startLoop());
```

When SignalR data arrives (which *does* need change detection), the callback explicitly re-enters the zone:

```typescript
this.hubConnection.on('TelemetryUpdate', (data) => {
    this.zone.run(() => {
        this.readingsSubject.next(data.readings);
    });
});
```

**Lesson:** For any high-frequency operation that doesn't affect Angular bindings, run it outside the zone. Re-enter the zone only when you need Angular to notice the change.

---

## Aggregation Scaling Bug

**The problem:** When viewing a 1-hour time range with 10-second buckets, the energy chart showed values 10x higher than the live view.

**Root cause:** The initial SQL query bucketed all readings and SUMmed them. A 10-second bucket contains ~120 readings (12 poles × 10 ticks), so the SUM was 10x a single tick's total.

**The fix:** A two-pass CTE that first aggregates per tick (cross-pole SUM), then averages per bucket:

```sql
WITH TickAgg AS (
    SELECT CAST(strftime('%s', Timestamp) AS INTEGER) AS Epoch,
           SUM(EnergyWatts) AS Energy, ...
    FROM TelemetryReadings
    GROUP BY Epoch
)
SELECT (Epoch / @bucket) * @bucket AS BucketEpoch,
       AVG(Energy) AS TotalEnergy, ...
FROM TickAgg
GROUP BY BucketEpoch
```

**Lesson:** When aggregating time-series data that has a per-tick structure (12 readings per second), aggregate within the tick first, then bucket. Otherwise, your bucket size directly scales the values.

---

## SSE Parsing Without EventSource

**The problem:** The browser's `EventSource` API only supports GET requests. The chat endpoint needs a POST body (the message) and custom headers (the API key).

**The fix:** Use `fetch()` with a `ReadableStream` reader and manually parse SSE events:

```typescript
const reader = resp.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on \n\n boundaries, parse event: and data: lines
}
```

**Lesson:** SSE is a simple protocol (text lines separated by double newlines), but the `EventSource` API's GET-only limitation means you often need to implement the parsing yourself for real applications.

---

## FAISS Index Isn't Persistent

**The problem:** After restarting the AI service, the FAISS index was empty until new incident logs were generated.

**Root cause:** FAISS's in-memory index is not persisted to disk. The initial implementation only ingested *new* logs.

**The fix:** On startup, load all existing incident logs from SQLite and index them:

```python
persisted_chunks, last_id = load_persisted_incidents(engine)
if persisted_chunks:
    retriever.add_chunks(persisted_chunks)
```

**Lesson:** For small indexes (<10,000 vectors), rebuilding from the source of truth on startup is simpler and more reliable than persisting the FAISS index to disk and dealing with sync issues.

---

## Entity Count Visual Caps

**The problem:** When a pole had 30+ pedestrians (e.g., during a crowd cluster anomaly), the canvas became an unreadable mess of overlapping dots.

**The fix:** Cap entity counts per pole for visual clarity:

```typescript
pr.pedestrians = Math.min(r.pedestrianCount, 8);
pr.vehicles = Math.min(r.vehicleCount, 5);
pr.cyclists = Math.min(r.cyclistCount, 3);
```

The actual telemetry values are still shown in the dashboard — the canvas just caps the visual representation.

**Lesson:** The simulation canvas is a *visualization*, not a *data display*. It should convey the *feel* of activity levels (busy vs. quiet) without trying to render exact counts. The dashboard handles precision.

---

## Singleton Services Can't Inject Scoped Services

**The problem:** `SimulationEngine` (singleton) needed `AppDbContext` (scoped) to save readings. Direct injection threw a runtime error.

**Root cause:** .NET's DI container prevents singletons from resolving scoped services because the scoped service would outlive its intended scope.

**The fix:** Inject `IServiceScopeFactory` and create scopes on demand:

```csharp
using var scope = _scopeFactory.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
```

This pattern is used in both `TelemetryService` and `IncidentLogGenerator`.

**Lesson:** In .NET DI, when a long-lived service needs a short-lived dependency, use `IServiceScopeFactory`. This is a common pattern for background services that need database access.
