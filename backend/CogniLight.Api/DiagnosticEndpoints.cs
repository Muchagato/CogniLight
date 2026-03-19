using CogniLight.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CogniLight.Api;

public static class DiagnosticEndpoints
{
    public static void MapDiagnosticEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/diag");

        // Check how timestamps are actually stored
        api.MapGet("/timestamp-format", async (IServiceScopeFactory scopeFactory) =>
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var conn = db.Database.GetDbConnection();
            await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT Timestamp FROM TelemetryReadings ORDER BY Id DESC LIMIT 5";

            var samples = new List<string>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                samples.Add(reader.GetString(0));
            }

            return new { storedFormat = samples };
        });

        // Test the exact query with frontend-like parameters
        api.MapGet("/test-history", async (string from, string to, int bucket, IServiceScopeFactory scopeFactory) =>
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var conn = db.Database.GetDbConnection();
            await conn.OpenAsync();

            // Parse like Program.cs does
            var fromDt = DateTime.Parse(from, null, System.Globalization.DateTimeStyles.RoundtripKind);
            var toDt = DateTime.Parse(to, null, System.Globalization.DateTimeStyles.RoundtripKind);

            // Format like TelemetryService does
            var fromFormatted = fromDt.ToString("yyyy-MM-dd HH:mm:ss.FFFFFFF");
            var toFormatted = toDt.ToString("yyyy-MM-dd HH:mm:ss.FFFFFFF");

            // First, check raw count with different WHERE approaches
            using var countCmd = conn.CreateCommand();
            countCmd.CommandText = """
                SELECT
                    (SELECT COUNT(*) FROM TelemetryReadings) as total,
                    (SELECT COUNT(*) FROM TelemetryReadings WHERE Timestamp >= @from1 AND Timestamp <= @to1) as withFormattedParams,
                    (SELECT COUNT(*) FROM TelemetryReadings WHERE Timestamp >= @from2 AND Timestamp <= @to2) as withRawIsoParams,
                    (SELECT MIN(Timestamp) FROM TelemetryReadings) as minTs,
                    (SELECT MAX(Timestamp) FROM TelemetryReadings) as maxTs
                """;
            countCmd.Parameters.Add(new SqliteParameter("@from1", fromFormatted));
            countCmd.Parameters.Add(new SqliteParameter("@to1", toFormatted));
            countCmd.Parameters.Add(new SqliteParameter("@from2", from));
            countCmd.Parameters.Add(new SqliteParameter("@to2", to));

            using var countReader = await countCmd.ExecuteReaderAsync();
            await countReader.ReadAsync();

            var total = countReader.GetInt64(0);
            var withFormatted = countReader.GetInt64(1);
            var withRawIso = countReader.GetInt64(2);
            var minTs = countReader.IsDBNull(3) ? null : countReader.GetString(3);
            var maxTs = countReader.IsDBNull(4) ? null : countReader.GetString(4);

            // Now run the actual CTE query
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                WITH TickAgg AS (
                    SELECT
                        CAST(strftime('%s', Timestamp) AS INTEGER) AS Epoch,
                        SUM(EnergyWatts) AS Energy
                    FROM TelemetryReadings
                    WHERE Timestamp >= @from AND Timestamp <= @to
                    GROUP BY Epoch
                )
                SELECT COUNT(*) FROM TickAgg
                """;
            cmd.Parameters.Add(new SqliteParameter("@bucket", bucket));
            cmd.Parameters.Add(new SqliteParameter("@from", fromFormatted));
            cmd.Parameters.Add(new SqliteParameter("@to", toFormatted));

            var tickCount = Convert.ToInt64(await cmd.ExecuteScalarAsync());

            return new
            {
                input = new { from, to, bucket },
                parsed = new { fromDt, toDt },
                formatted = new { fromFormatted, toFormatted },
                database = new { total, minTs, maxTs },
                matchCounts = new { withFormattedParams = withFormatted, withRawIsoParams = withRawIso },
                cteTickCount = tickCount
            };
        });
    }
}
