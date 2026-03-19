using CogniLight.Api;
using CogniLight.Api.Data;
using CogniLight.Api.Hubs;
using CogniLight.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=cognilight.db";
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// Services
builder.Services.AddSingleton<TelemetryService>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<SimulationEngine>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SimulationEngine>());

// CORS — allow Angular dev server
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

var app = builder.Build();

// Ensure database is created, prune data older than 3 days
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    var cutoff = DateTime.UtcNow.AddDays(-3);
    db.TelemetryReadings.Where(r => r.Timestamp < cutoff).ExecuteDelete();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

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

api.MapGet("/telemetry/anomalies/range", async (string from, string to, int? limit, TelemetryService svc) =>
{
    var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);
    var anomalies = await svc.GetAnomaliesInRangeAsync(fromDt, toDt, limit ?? 200);
    return anomalies.Select(a => new
    {
        time = a.Timestamp.ToString("o"),
        poleId = a.PoleId,
        description = a.AnomalyDescription ?? ""
    });
});

api.MapGet("/simulation/status", (SimulationEngine engine) =>
    new
    {
        time = DateTime.UtcNow.ToString("o"),
        running = engine.IsRunning,
    });

api.MapGet("/simulation/poles", () => SimulationEngine.GetPoleLayout());

api.MapPost("/simulation/pause", (SimulationEngine engine) =>
{
    engine.SetRunning(false);
    return Results.Ok(new { running = false });
});

api.MapPost("/simulation/resume", (SimulationEngine engine) =>
{
    engine.SetRunning(true);
    return Results.Ok(new { running = true });
});

// SignalR hub
app.MapHub<TelemetryHub>("/hubs/telemetry");

// Diagnostic endpoints (dev only)
if (app.Environment.IsDevelopment())
{
    app.MapDiagnosticEndpoints();
}

app.Run();
