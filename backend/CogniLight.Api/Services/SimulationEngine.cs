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
    private readonly Random _rng = new(42);

    private static readonly string[] PoleIds =
        Enumerable.Range(1, 12).Select(i => $"POLE-{i:D2}").ToArray();

    private static readonly (double X, double Y)[] PolePositions =
    [
        (0.22, 0.12), (0.22, 0.35), (0.22, 0.65), (0.22, 0.88),
        (0.32, 0.12), (0.32, 0.35),
        (0.32, 0.65), (0.32, 0.88),
        (0.68, 0.12), (0.68, 0.50),
        (0.78, 0.35), (0.78, 0.88),
    ];

    // Building type near each pole — determines activity profile
    private enum ZoneType { Office, Retail, Park, School, Mall, Apt, Cafe, Gym, Residence, Tower, Hotel, Mixed }

    // Pole index → zone type mapping:
    // P01=Office, P02=Retail, P03=Park, P04=School, P05=Mall, P06=Apt,
    // P07=Gym, P08=Residence, P09=Mall/Cafe, P10=Mixed, P11=Tower, P12=Hotel
    private static readonly ZoneType[] PoleZones =
    [
        ZoneType.Office, ZoneType.Retail, ZoneType.Park, ZoneType.School,
        ZoneType.Mall, ZoneType.Apt,
        ZoneType.Gym, ZoneType.Residence,
        ZoneType.Cafe, ZoneType.Mixed,
        ZoneType.Tower, ZoneType.Hotel,
    ];

    /// <summary>
    /// Returns (pedestrianMultiplier, vehicleMultiplier, cyclistMultiplier)
    /// for a given zone type and hour of day.
    /// </summary>
    private static (double ped, double veh, double cyc) GetZoneActivity(ZoneType zone, double hour)
    {
        var isWorkHours = hour >= 8 && hour < 18;
        var isMorningRush = hour >= 7 && hour < 9;
        var isEveningRush = hour >= 17 && hour < 19;
        var isEvening = hour >= 19 && hour < 23;
        var isLateNight = hour < 5 || hour >= 23;
        var isDaytime = hour >= 6 && hour < 20;

        return zone switch
        {
            // Office: busy during work hours, dead at night
            ZoneType.Office => isWorkHours ? (3.0, 2.0, 1.0)
                : isMorningRush || isEveningRush ? (2.0, 3.0, 0.5)
                : isLateNight ? (0.0, 0.0, 0.0)
                : (0.2, 0.3, 0.0),

            // Retail: busy daytime especially afternoon, some evening
            ZoneType.Retail => hour >= 10 && hour < 20 ? (3.0, 2.0, 1.0)
                : isEvening ? (1.0, 0.5, 0.0)
                : isLateNight ? (0.0, 0.0, 0.0)
                : (0.3, 0.3, 0.1),

            // Park: busy mornings and evenings, some afternoon, dead at night
            ZoneType.Park => (hour >= 6 && hour < 9) || (hour >= 17 && hour < 20) ? (3.0, 0.2, 2.0)
                : isDaytime ? (1.5, 0.1, 1.0)
                : (0.0, 0.0, 0.0),

            // School: peaks at drop-off/pickup, empty nights and weekends
            ZoneType.School => (hour >= 7.5 && hour < 8.5) || (hour >= 15 && hour < 16) ? (4.0, 3.0, 1.0)
                : (hour >= 8.5 && hour < 15) ? (1.0, 0.3, 0.2)
                : isLateNight ? (0.0, 0.0, 0.0)
                : (0.2, 0.2, 0.0),

            // Mall: busy from late morning to evening
            ZoneType.Mall => hour >= 10 && hour < 21 ? (3.0, 3.0, 0.5)
                : isEvening ? (1.0, 1.0, 0.0)
                : isLateNight ? (0.0, 0.0, 0.0)
                : (0.2, 0.3, 0.0),

            // Apartment: morning/evening presence, moderate overnight
            ZoneType.Apt => isMorningRush ? (1.5, 1.5, 0.5)
                : isEveningRush ? (2.0, 2.0, 0.5)
                : isEvening ? (1.5, 0.5, 0.0)
                : isWorkHours ? (0.3, 0.2, 0.1)
                : isLateNight ? (0.1, 0.0, 0.0)
                : (0.5, 0.3, 0.1),

            // Cafe: morning coffee rush, lunch, afternoon, quiet at night
            ZoneType.Cafe => (hour >= 7 && hour < 10) ? (2.5, 1.0, 0.5)
                : (hour >= 12 && hour < 14) ? (3.0, 1.5, 0.5)
                : (hour >= 10 && hour < 18) ? (1.5, 0.8, 0.3)
                : isEvening ? (1.0, 0.5, 0.0)
                : (0.0, 0.0, 0.0),

            // Gym: early morning and after-work peaks
            ZoneType.Gym => (hour >= 6 && hour < 8) || (hour >= 17 && hour < 21) ? (2.5, 1.5, 1.0)
                : (hour >= 8 && hour < 17) ? (1.0, 0.5, 0.3)
                : isLateNight ? (0.0, 0.0, 0.0)
                : (0.2, 0.1, 0.0),

            // Residence: similar to Apt but slightly more pedestrian activity
            ZoneType.Residence => isMorningRush ? (1.5, 2.0, 0.5)
                : isEveningRush ? (2.0, 2.5, 0.5)
                : isEvening ? (1.5, 0.5, 0.0)
                : isWorkHours ? (0.3, 0.2, 0.1)
                : isLateNight ? (0.1, 0.0, 0.0)
                : (0.5, 0.3, 0.1),

            // Tower (office high-rise): similar to office but more traffic
            ZoneType.Tower => isWorkHours ? (3.0, 3.0, 0.5)
                : isMorningRush || isEveningRush ? (2.5, 4.0, 0.5)
                : isLateNight ? (0.1, 0.0, 0.0)
                : (0.3, 0.3, 0.0),

            // Hotel: steady activity, peaks morning/evening, moderate overnight
            ZoneType.Hotel => isMorningRush ? (2.0, 2.0, 0.3)
                : isEveningRush ? (2.5, 2.0, 0.3)
                : isEvening ? (1.5, 1.0, 0.0)
                : isWorkHours ? (1.0, 1.0, 0.2)
                : isLateNight ? (0.3, 0.2, 0.0)
                : (0.5, 0.5, 0.1),

            // Mixed: moderate at all times
            _ => isDaytime ? (1.5, 1.5, 0.5)
                : isEvening ? (1.0, 0.8, 0.2)
                : (0.2, 0.1, 0.0),
        };
    }

    // Per-pole smoothed state — values drift gradually instead of jumping
    private class PoleState
    {
        public double Pedestrians;
        public double Vehicles;
        public double Cyclists;
        public double Temperature;
        public double Humidity;
        public double AirQuality;
        public double Noise;
        public double Energy;
    }

    private readonly PoleState[] _poleStates;

    public SimulationEngine(
        IHubContext<TelemetryHub> hubContext,
        TelemetryService telemetryService,
        ILogger<SimulationEngine> logger)
    {
        _hubContext = hubContext;
        _telemetryService = telemetryService;
        _logger = logger;

        // Initialize pole states with reasonable defaults
        _poleStates = new PoleState[PoleIds.Length];
        for (int i = 0; i < PoleIds.Length; i++)
            _poleStates[i] = new PoleState
            {
                Pedestrians = 1, Vehicles = 2, Cyclists = 0,
                Temperature = 22, Humidity = 55, AirQuality = 50,
                Noise = 45, Energy = 120
            };
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Simulation engine starting. Time: {Time}", DateTime.UtcNow);
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
        try
        {
            var now = DateTime.UtcNow;
            var readings = GenerateReadings(now);

            await _telemetryService.SaveReadingsAsync(readings);
            await _hubContext.Clients.All.SendAsync("TelemetryUpdate", new
            {
                simulationTime = now.ToString("o"),
                readings
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in simulation tick");
        }
    }

    private List<TelemetryReading> GenerateReadings(DateTime now)
    {
        var hour = now.Hour + now.Minute / 60.0;
        var readings = new List<TelemetryReading>();

        for (int i = 0; i < PoleIds.Length; i++)
        {
            var reading = GeneratePoleReading(PoleIds[i], i, hour, now);
            readings.Add(reading);
        }

        return readings;
    }

    /// <summary>
    /// Smoothly evolves a value toward a target using exponential smoothing + small noise.
    /// α controls how fast it tracks the target (lower = smoother, slower drift).
    /// </summary>
    private double Smooth(double current, double target, double alpha, double noiseScale)
    {
        var smoothed = current + alpha * (target - current);
        smoothed += (_rng.NextDouble() - 0.5) * 2 * noiseScale;
        return smoothed;
    }

    private TelemetryReading GeneratePoleReading(string poleId, int poleIndex, double hour, DateTime timestamp)
    {
        var ps = _poleStates[poleIndex];

        // Ambient light follows deterministic solar curve (no noise — it's a physical constant)
        var ambientLight = CalculateAmbientLight(hour);

        // Per-pole activity based on nearby building type
        var zone = PoleZones[poleIndex];
        var (pedTarget, vehTarget, cycTarget) = GetZoneActivity(zone, hour);
        var targetPedestrians = pedTarget;
        var targetVehicles = vehTarget;
        var targetCyclists = cycTarget;

        // Smooth counts toward targets (α=0.05 → takes ~20 ticks to mostly converge)
        ps.Pedestrians = Smooth(ps.Pedestrians, targetPedestrians, 0.05, 0.3);
        ps.Vehicles = Smooth(ps.Vehicles, targetVehicles, 0.05, 0.2);
        ps.Cyclists = Smooth(ps.Cyclists, targetCyclists, 0.05, 0.1);

        var pedestrians = Math.Max(0, (int)Math.Round(ps.Pedestrians));
        var vehicles = Math.Max(0, (int)Math.Round(ps.Vehicles));
        var cyclists = Math.Max(0, (int)Math.Round(ps.Cyclists));

        // Adaptive dimming
        var lightLevel = CalculateLightLevel(ambientLight, pedestrians + vehicles + cyclists);

        // Smooth energy and environmental sensors
        var targetEnergy = 50 + lightLevel * 2.0;
        ps.Energy = Smooth(ps.Energy, targetEnergy, 0.08, 1.5);
        var energy = Math.Clamp(ps.Energy, 50, 250);

        var targetTemp = 20 + 7 * Math.Sin((hour - 14) * Math.PI / 12);
        ps.Temperature = Smooth(ps.Temperature, targetTemp, 0.02, 0.1);
        var temperature = Math.Clamp(ps.Temperature, 15, 35);

        var targetHumidity = 60 - 10 * Math.Sin((hour - 14) * Math.PI / 12);
        ps.Humidity = Smooth(ps.Humidity, targetHumidity, 0.02, 0.2);
        var humidity = Math.Clamp(ps.Humidity, 40, 80);

        var targetAqi = 40.0 + vehicles * 3;
        ps.AirQuality = Smooth(ps.AirQuality, targetAqi, 0.06, 0.5);
        var airQuality = (int)Math.Clamp(ps.AirQuality, 20, 150);

        var targetNoise = 35.0 + vehicles * 2.5 + pedestrians * 0.5;
        ps.Noise = Smooth(ps.Noise, targetNoise, 0.06, 0.3);
        var noise = Math.Clamp(ps.Noise, 30, 85);

        // Anomaly injection (~0.3% chance per pole per tick — roughly one every 5 minutes across all poles)
        var (anomalyFlag, anomalyDesc) = MaybeInjectAnomaly(
            poleId, zone, hour, pedestrians, energy, airQuality);

        if (anomalyFlag && anomalyDesc?.Contains("energy spike") == true)
        {
            ps.Energy = 240;
            energy = 240;
        }
        if (anomalyFlag && anomalyDesc?.Contains("cluster") == true)
        {
            // Scale cluster spike to what's plausible — a few extra people, not 30
            var (basePed, _, _) = GetZoneActivity(zone, hour);
            var spike = Math.Max(3, (int)(basePed * _rng.Next(3, 6)));
            ps.Pedestrians += spike;
            pedestrians += spike;
        }

        return new TelemetryReading
        {
            PoleId = poleId,
            Timestamp = timestamp,
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
        if (hour < 5 || hour > 21) return 2;
        if (hour < 7) return (hour - 5) / 2.0 * 10000;
        if (hour > 19) return (21 - hour) / 2.0 * 10000;
        var peak = 1 - Math.Abs(hour - 13) / 6.0;
        return 10000 + peak * 90000;
    }

    private static double CalculateLightLevel(double ambientLux, int entityCount)
    {
        var baseDim = Math.Clamp(100 - ambientLux / 1000.0, 0, 100);
        var presenceBoost = Math.Min(entityCount * 2.0, 30);
        return Math.Clamp(baseDim + presenceBoost, 0, 100);
    }

    private (bool flag, string? description) MaybeInjectAnomaly(
        string poleId, ZoneType zone, double hour, int pedestrians, double energy, int aqi)
    {
        // ~0.3% base chance per pole per tick ≈ 1 anomaly every ~5 min across 12 poles
        if (_rng.NextDouble() > 0.003) return (false, null);

        // Build a pool of contextually valid anomaly scenarios
        var candidates = new List<string>();

        // Pedestrian cluster — only flag if the zone should be quiet right now
        var (expectedPed, _, _) = GetZoneActivity(zone, hour);
        if (expectedPed < 1.0)
        {
            var zoneName = zone switch
            {
                ZoneType.Office => "office district",
                ZoneType.School => "school zone",
                ZoneType.Park => "park area",
                ZoneType.Retail => "retail strip",
                ZoneType.Mall => "mall area",
                _ => "area"
            };
            candidates.Add($"Unusual pedestrian cluster near {poleId} ({zoneName}) during off-hours");
        }

        // Energy spike — can happen anytime (hardware malfunction)
        candidates.Add($"Sudden energy spike on {poleId} — possible malfunction");

        // Sensor dropout — can happen anytime
        candidates.Add($"Sensor dropout on {poleId} — null readings detected");

        // AQI spike — more likely during low-traffic periods (uncorrelated = suspicious)
        if (pedestrians + aqi < 80)
            candidates.Add($"Air quality spike at {poleId} uncorrelated with traffic");

        // Pick one at random from the valid candidates
        var chosen = candidates[_rng.Next(candidates.Count)];
        return (true, chosen);
    }

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
