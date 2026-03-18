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

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
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

api.MapGet("/simulation/status", (SimulationEngine engine) =>
    new { time = engine.GetSimulationTime().ToString("o") });

api.MapPost("/simulation/speed/{multiplier:int}", (int multiplier, SimulationEngine engine) =>
{
    engine.SetSpeed(multiplier);
    return Results.Ok(new { speed = multiplier });
});

api.MapPost("/simulation/toggle", (SimulationEngine engine) =>
{
    // Toggle is handled via query param
    return Results.Ok();
});

// SignalR hub
app.MapHub<TelemetryHub>("/hubs/telemetry");

app.Run();
