using System.Text.Json;
using CogniLight.Api;
using CogniLight.Api.Data;
using CogniLight.Api.Hubs;
using CogniLight.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// JSON: camelCase for JavaScript interop
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

// Request size limit (10 MB)
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 10 * 1024 * 1024;
});

// Suppress noisy EF Core and SignalR logs
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Update", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.SignalR", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Http.Connections", LogLevel.Warning);

// Database
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=cognilight.db";
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// Services
builder.Services.AddSingleton<TelemetryService>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IncidentLogGenerator>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<IncidentLogGenerator>());
builder.Services.AddSingleton<SimulationEngine>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SimulationEngine>());

// CORS — configurable via CORS_ORIGINS env var (comma-separated), falls back to localhost for dev
var corsOrigins = builder.Configuration["CORS_ORIGINS"];
var origins = !string.IsNullOrWhiteSpace(corsOrigins)
    ? corsOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    : new[] { "http://localhost:4200" };
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(origins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

var app = builder.Build();

// Ensure database is created, add missing tables, prune old data
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Enable WAL mode for concurrent read/write (AI service reads while backend writes)
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");

    // EnsureCreated won't add new tables to an existing DB — create manually if missing
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
    db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS IX_IncidentLogs_PoleId ON IncidentLogs (PoleId)");
    db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS IX_IncidentLogs_Timestamp ON IncidentLogs (Timestamp)");

    var cutoff = DateTime.UtcNow.AddDays(-3);
    db.TelemetryReadings.Where(r => r.Timestamp < cutoff).ExecuteDelete();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

// Production: generic error responses, no stack traces
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(error =>
    {
        error.Run(async context =>
        {
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("""{"error":"Internal server error"}""");
        });
    });
}

// REST endpoints
var api = app.MapGroup("/api");

api.MapGet("/telemetry/latest", async (TelemetryService svc) =>
    await svc.GetLatestReadingsAsync());

api.MapGet("/telemetry/{poleId}", async (string poleId, TelemetryService svc) =>
    await svc.GetReadingsByPoleAsync(poleId));

api.MapGet("/telemetry/anomalies", async (TelemetryService svc) =>
    await svc.GetAnomaliesAsync());

api.MapGet("/telemetry/history", async (string from, string to, int bucketSeconds, TelemetryService svc) =>
{
    var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);
    return await svc.GetAggregatedHistoryAsync(fromDt, toDt, bucketSeconds);
});

api.MapGet("/telemetry/history/{poleId}", async (string poleId, string from, string to, int bucketSeconds, TelemetryService svc) =>
{
    var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);
    return await svc.GetPoleHistoryAsync(poleId, fromDt, toDt, bucketSeconds);
});

api.MapGet("/telemetry/anomalies/range", async (string from, string to, TelemetryService svc) =>
{
    var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var anomalies = await svc.GetAnomaliesInRangeAsync(fromDt, toDt);
    return anomalies.Select(a => new
    {
        time = a.Timestamp.ToString("o"),
        poleId = a.PoleId,
        description = a.AnomalyDescription ?? ""
    });
});

api.MapGet("/incidents", async (string? from, string? to, AppDbContext db) =>
{
    var query = db.IncidentLogs.AsQueryable();

    if (from != null && to != null)
    {
        var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
        var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);
        query = query.Where(l => l.Timestamp >= fromDt && l.Timestamp <= toDt);
    }

    return await query
        .OrderByDescending(l => l.Timestamp)
        .Select(l => new
        {
            l.Id, l.Timestamp, l.PoleId, l.Author, l.Category, l.Text
        })
        .ToListAsync();
});

api.MapGet("/simulation/status", () =>
    new
    {
        time = DateTime.UtcNow.ToString("o"),
    });

api.MapGet("/simulation/poles", () => SimulationEngine.GetPoleLayout());

// SignalR hub
app.MapHub<TelemetryHub>("/hubs/telemetry");

// Diagnostic endpoints (dev only)
if (app.Environment.IsDevelopment())
{
    app.MapDiagnosticEndpoints();
}

app.Run();
