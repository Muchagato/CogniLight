using CogniLight.Api.Hubs;
using CogniLight.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace CogniLight.Api.Services;

public class SimulationEngine : IHostedService, IDisposable
{
    private readonly IHubContext<TelemetryHub> _hubContext;
    private readonly TelemetryService _telemetryService;
    private readonly ILogger<SimulationEngine> _logger;
    private Timer? _timer;
    private DateTime _simulationTime;
    private readonly Random _rng = new(42);
    private bool _running = true;
    private int _speedMultiplier = 1;

    private static readonly string[] PoleIds =
        Enumerable.Range(1, 12).Select(i => $"POLE-{i:D2}").ToArray();

    // Pole positions (normalized 0-1) along two vertical streets with horizontal crossroad
    // Left street at x≈0.25, right street at x≈0.75
    // Horizontal crossroad at y≈0.5
    private static readonly (double X, double Y)[] PolePositions =
    [
        (0.22, 0.12), (0.22, 0.35), (0.22, 0.65), (0.22, 0.88),  // Left street, west side
        (0.32, 0.12), (0.32, 0.35),                                // Left street, east side (top)
        (0.32, 0.65), (0.32, 0.88),                                // Left street, east side (bottom)
        (0.68, 0.12), (0.68, 0.50),                                // Right street, west side
        (0.78, 0.35), (0.78, 0.88),                                // Right street, east side
    ];

    public SimulationEngine(
        IHubContext<TelemetryHub> hubContext,
        TelemetryService telemetryService,
        ILogger<SimulationEngine> logger)
    {
        _hubContext = hubContext;
        _telemetryService = telemetryService;
        _logger = logger;
        _simulationTime = DateTime.UtcNow.Date.AddHours(6); // Start at 6:00 AM
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Simulation engine starting. Time: {Time}", _simulationTime);
        _timer = new Timer(Tick, null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Simulation engine stopping.");
        _timer?.Change(Timeout.Infinite, 0);
        return Task.CompletedTask;
    }

    private async void Tick(object? state)
    {
        if (!_running) return;

        try
        {
            _simulationTime = _simulationTime.AddMinutes(_speedMultiplier);
            var readings = GenerateReadings();

            await _telemetryService.SaveReadingsAsync(readings);
            await _hubContext.Clients.All.SendAsync("TelemetryUpdate", new
            {
                simulationTime = _simulationTime.ToString("o"),
                readings
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in simulation tick");
        }
    }

    private List<TelemetryReading> GenerateReadings()
    {
        var hour = _simulationTime.Hour + _simulationTime.Minute / 60.0;
        var readings = new List<TelemetryReading>();

        for (int i = 0; i < PoleIds.Length; i++)
        {
            var reading = GeneratePoleReading(PoleIds[i], i, hour);
            readings.Add(reading);
        }

        return readings;
    }

    private TelemetryReading GeneratePoleReading(string poleId, int poleIndex, double hour)
    {
        // Time-of-day factors
        var isDaytime = hour >= 6 && hour < 20;
        var isRushHour = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
        var isNight = hour < 6 || hour >= 22;
        var isLateNight = hour < 4 || hour >= 23;

        // Ambient light follows solar curve
        var ambientLight = CalculateAmbientLight(hour);

        // Traffic density varies by time
        var trafficMultiplier = isRushHour ? 2.5 : (isDaytime ? 1.0 : 0.3);
        if (isLateNight) trafficMultiplier = 0.1;

        var pedestrians = (int)(Poisson(_rng, 5 * trafficMultiplier) + Noise(2));
        var vehicles = (int)(Poisson(_rng, 8 * trafficMultiplier) + Noise(1));
        var cyclists = (int)(Poisson(_rng, 2 * (isDaytime ? 1.0 : 0.2)) + Noise(1));

        pedestrians = Math.Max(0, pedestrians);
        vehicles = Math.Max(0, vehicles);
        cyclists = Math.Max(0, cyclists);

        // Adaptive dimming: brighter when more people around or darker outside
        var lightLevel = CalculateLightLevel(ambientLight, pedestrians + vehicles + cyclists);

        // Energy correlates with light level
        var energy = 50 + lightLevel * 2.0 + Noise(10);
        energy = Math.Clamp(energy, 50, 250);

        // Environmental sensors
        var temperature = 20 + 7 * Math.Sin((hour - 14) * Math.PI / 12) + Noise(1.5);
        temperature = Math.Clamp(temperature, 15, 35);

        var humidity = 60 - 10 * Math.Sin((hour - 14) * Math.PI / 12) + Noise(3);
        humidity = Math.Clamp(humidity, 40, 80);

        var airQuality = (int)(40 + vehicles * 3 + Noise(10));
        airQuality = Math.Clamp(airQuality, 20, 150);

        var noise = 35 + vehicles * 2.5 + pedestrians * 0.5 + Noise(5);
        noise = Math.Clamp(noise, 30, 85);

        // Anomaly injection (~3% chance)
        var (anomalyFlag, anomalyDesc) = MaybeInjectAnomaly(
            poleId, hour, pedestrians, energy, airQuality);

        // Apply anomaly effects
        if (anomalyFlag && anomalyDesc?.Contains("energy spike") == true)
            energy = 240 + Noise(10);
        if (anomalyFlag && anomalyDesc?.Contains("cluster") == true)
            pedestrians += _rng.Next(15, 30);

        return new TelemetryReading
        {
            PoleId = poleId,
            Timestamp = _simulationTime,
            EnergyWatts = Math.Round(energy, 1),
            PedestrianCount = pedestrians,
            VehicleCount = vehicles,
            CyclistCount = cyclists,
            AmbientLightLux = Math.Round(ambientLight, 1),
            TemperatureC = Math.Round(temperature, 1),
            HumidityPct = Math.Round(humidity, 1),
            AirQualityAqi = airQuality,
            NoiseDb = Math.Round(noise, 1),
            LightLevelPct = Math.Round(lightLevel, 1),
            AnomalyFlag = anomalyFlag,
            AnomalyDescription = anomalyDesc
        };
    }

    private double CalculateAmbientLight(double hour)
    {
        // Simplified solar curve
        if (hour < 5 || hour > 21) return _rng.NextDouble() * 5;
        if (hour < 7) return (hour - 5) / 2.0 * 10000;
        if (hour > 19) return (21 - hour) / 2.0 * 10000;
        // Peak around noon
        var peak = 1 - Math.Abs(hour - 13) / 6.0;
        return 10000 + peak * 90000;
    }

    private double CalculateLightLevel(double ambientLux, int entityCount)
    {
        // Inverse of ambient light + presence boost
        var baseDim = Math.Clamp(100 - ambientLux / 1000.0, 0, 100);
        var presenceBoost = Math.Min(entityCount * 2.0, 30);
        return Math.Clamp(baseDim + presenceBoost, 0, 100);
    }

    private (bool flag, string? description) MaybeInjectAnomaly(
        string poleId, double hour, int pedestrians, double energy, int aqi)
    {
        if (_rng.NextDouble() > 0.03) return (false, null);

        var scenario = _rng.Next(4);
        return scenario switch
        {
            0 => (true, $"Unusual pedestrian cluster at {poleId} during off-hours"),
            1 => (true, $"Sudden energy spike on {poleId} — possible malfunction"),
            2 => (true, $"Sensor dropout on {poleId} — null readings detected"),
            3 => (true, $"Air quality spike at {poleId} uncorrelated with traffic"),
            _ => (false, null)
        };
    }

    private double Noise(double scale) => (_rng.NextDouble() - 0.5) * 2 * scale;

    private static int Poisson(Random rng, double lambda)
    {
        if (lambda <= 0) return 0;
        var l = Math.Exp(-lambda);
        var k = 0;
        var p = 1.0;
        do
        {
            k++;
            p *= rng.NextDouble();
        } while (p > l);
        return k - 1;
    }

    public int SpeedMultiplier => _speedMultiplier;
    public bool IsRunning => _running;

    public void SetSpeed(int multiplier) => _speedMultiplier = Math.Clamp(multiplier, 1, 10);
    public void SetRunning(bool running) => _running = running;
    public DateTime GetSimulationTime() => _simulationTime;

    public static object[] GetPoleLayout() =>
        PoleIds.Select((id, i) => new
        {
            poleId = id,
            x = PolePositions[i].X,
            y = PolePositions[i].Y
        }).ToArray<object>();

    public void Dispose()
    {
        _timer?.Dispose();
    }
}
