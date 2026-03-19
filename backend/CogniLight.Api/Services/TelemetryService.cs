using System.Globalization;
using CogniLight.Api.Data;
using CogniLight.Api.Models;
using Microsoft.Data.Sqlite;
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

    public async Task<List<AggregatedBucket>> GetAggregatedHistoryAsync(
        DateTime from, DateTime to, int bucketSeconds)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync();

        // CTE: first aggregate per tick (sum across 12 poles), then average per bucket.
        // This avoids the scaling bug where SUM across a 10s bucket would be 10x a single tick.
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            WITH TickAgg AS (
                SELECT
                    CAST(strftime('%s', Timestamp) AS INTEGER) AS Epoch,
                    SUM(EnergyWatts) AS Energy,
                    SUM(PedestrianCount) AS Ped,
                    SUM(VehicleCount) AS Veh,
                    SUM(CyclistCount) AS Cyc,
                    AVG(TemperatureC) AS Temp,
                    AVG(HumidityPct) AS Humid,
                    AVG(AirQualityAqi) AS Aqi,
                    AVG(NoiseDb) AS Noise,
                    SUM(CASE WHEN AnomalyFlag = 1 THEN 1 ELSE 0 END) AS Anomalies
                FROM TelemetryReadings
                WHERE Timestamp >= @from AND Timestamp <= @to
                GROUP BY Epoch
            )
            SELECT
                (Epoch / @bucket) * @bucket AS BucketEpoch,
                AVG(Energy) AS TotalEnergy,
                AVG(Ped) AS TotalPedestrians,
                AVG(Veh) AS TotalVehicles,
                AVG(Cyc) AS TotalCyclists,
                AVG(Temp) AS AvgTemperature,
                AVG(Humid) AS AvgHumidity,
                AVG(Aqi) AS AvgAqi,
                AVG(Noise) AS AvgNoise,
                SUM(Anomalies) AS AnomalyCount
            FROM TickAgg
            GROUP BY BucketEpoch
            ORDER BY BucketEpoch
            """;

        cmd.Parameters.Add(new SqliteParameter("@bucket", bucketSeconds));
        cmd.Parameters.Add(new SqliteParameter("@from", from.ToString("o")));
        cmd.Parameters.Add(new SqliteParameter("@to", to.ToString("o")));

        var results = new List<AggregatedBucket>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var epoch = reader.GetInt64(0);
            results.Add(new AggregatedBucket(
                BucketStart: DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime,
                TotalEnergy: reader.GetDouble(1),
                TotalPedestrians: reader.GetDouble(2),
                TotalVehicles: reader.GetDouble(3),
                TotalCyclists: reader.GetDouble(4),
                AvgTemperature: reader.GetDouble(5),
                AvgHumidity: reader.GetDouble(6),
                AvgAqi: reader.GetDouble(7),
                AvgNoise: reader.GetDouble(8),
                AnomalyCount: Convert.ToInt32(reader.GetValue(9))
            ));
        }

        return results;
    }

    public async Task<List<PoleBucket>> GetPoleHistoryAsync(
        string poleId, DateTime from, DateTime to, int bucketSeconds)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var conn = db.Database.GetDbConnection();
        await conn.OpenAsync();

        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT
                (CAST(strftime('%s', Timestamp) AS INTEGER) / @bucket) * @bucket AS BucketEpoch,
                AVG(EnergyWatts) AS AvgEnergy,
                AVG(PedestrianCount) AS AvgPedestrians,
                AVG(VehicleCount) AS AvgVehicles,
                AVG(CyclistCount) AS AvgCyclists,
                AVG(AirQualityAqi) AS AvgAqi,
                AVG(NoiseDb) AS AvgNoise,
                AVG(TemperatureC) AS AvgTemperature,
                AVG(HumidityPct) AS AvgHumidity,
                AVG(LightLevelPct) AS AvgLightLevel,
                SUM(CASE WHEN AnomalyFlag = 1 THEN 1 ELSE 0 END) AS AnomalyCount
            FROM TelemetryReadings
            WHERE PoleId = @poleId AND Timestamp >= @from AND Timestamp <= @to
            GROUP BY BucketEpoch
            ORDER BY BucketEpoch
            """;

        cmd.Parameters.Add(new SqliteParameter("@bucket", bucketSeconds));
        cmd.Parameters.Add(new SqliteParameter("@poleId", poleId));
        cmd.Parameters.Add(new SqliteParameter("@from", from.ToString("o")));
        cmd.Parameters.Add(new SqliteParameter("@to", to.ToString("o")));

        var results = new List<PoleBucket>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var epoch = reader.GetInt64(0);
            results.Add(new PoleBucket(
                BucketStart: DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime,
                AvgEnergy: reader.GetDouble(1),
                AvgPedestrians: reader.GetDouble(2),
                AvgVehicles: reader.GetDouble(3),
                AvgCyclists: reader.GetDouble(4),
                AvgAqi: reader.GetDouble(5),
                AvgNoise: reader.GetDouble(6),
                AvgTemperature: reader.GetDouble(7),
                AvgHumidity: reader.GetDouble(8),
                AvgLightLevel: reader.GetDouble(9),
                AnomalyCount: Convert.ToInt32(reader.GetValue(10))
            ));
        }

        return results;
    }

    public async Task<List<TelemetryReading>> GetAnomaliesInRangeAsync(
        DateTime from, DateTime to, int limit = 200)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.TelemetryReadings
            .Where(r => r.AnomalyFlag && r.Timestamp >= from && r.Timestamp <= to)
            .OrderByDescending(r => r.Timestamp)
            .Take(limit)
            .ToListAsync();
    }
}
