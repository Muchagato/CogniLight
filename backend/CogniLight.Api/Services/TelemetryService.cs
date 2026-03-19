using CogniLight.Api.Data;
using CogniLight.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CogniLight.Api.Services;

public class TelemetryService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public TelemetryService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task SaveReadingsAsync(IEnumerable<TelemetryReading> readings)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.TelemetryReadings.AddRange(readings);
        await db.SaveChangesAsync();

        // Prune data older than 3 days (run every ~100 ticks to avoid per-tick overhead)
        if (Random.Shared.Next(100) == 0)
        {
            var cutoff = DateTime.UtcNow.AddDays(-3);
            await db.TelemetryReadings
                .Where(r => r.Timestamp < cutoff)
                .ExecuteDeleteAsync();
        }
    }

    public async Task<List<TelemetryReading>> GetLatestReadingsAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var poleIds = Enumerable.Range(1, 12).Select(i => $"POLE-{i:D2}");
        var readings = new List<TelemetryReading>();

        foreach (var poleId in poleIds)
        {
            var latest = await db.TelemetryReadings
                .Where(r => r.PoleId == poleId)
                .OrderByDescending(r => r.Timestamp)
                .FirstOrDefaultAsync();
            if (latest != null)
                readings.Add(latest);
        }

        return readings;
    }

    public async Task<List<TelemetryReading>> GetReadingsByPoleAsync(string poleId, int limit = 100)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.TelemetryReadings
            .Where(r => r.PoleId == poleId)
            .OrderByDescending(r => r.Timestamp)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<TelemetryReading>> GetAnomaliesAsync(int limit = 50)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.TelemetryReadings
            .Where(r => r.AnomalyFlag)
            .OrderByDescending(r => r.Timestamp)
            .Take(limit)
            .ToListAsync();
    }
}
