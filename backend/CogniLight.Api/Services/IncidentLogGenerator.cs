using System.Collections.Concurrent;
using CogniLight.Api.Data;
using CogniLight.Api.Hubs;
using CogniLight.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace CogniLight.Api.Services;

/// <summary>
/// Generates realistic maintenance/incident logs as a background service.
/// Listens for anomaly events and periodically creates scheduled entries.
/// </summary>
public class IncidentLogGenerator : IHostedService, IDisposable
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<TelemetryHub> _hubContext;
    private readonly ILogger<IncidentLogGenerator> _logger;
    private Timer? _timer;
    private readonly Random _rng = new(123);

    // Track recent anomalies to generate follow-up logs (accessed from multiple timer threads)
    private readonly ConcurrentQueue<(DateTime Timestamp, string PoleId, string AnomalyDesc)> _pendingAnomalies = new();
    private DateTime _lastScheduledLog = DateTime.MinValue;

    private static readonly string[] TechnicianNames =
    [
        "Technician Silva", "Technician Costa", "Technician Ferreira",
        "Technician Santos", "Technician Oliveira", "Technician Pereira"
    ];

    private static readonly string[] AutoSystems =
    [
        "AutoDiag System", "Predictive Maintenance AI", "Control Room Operator"
    ];

    private static readonly Dictionary<string, string> PoleZoneNames = new()
    {
        ["POLE-01"] = "office district",
        ["POLE-02"] = "retail strip",
        ["POLE-03"] = "park area",
        ["POLE-04"] = "school zone",
        ["POLE-05"] = "mall area",
        ["POLE-06"] = "apartment complex",
        ["POLE-07"] = "gym area",
        ["POLE-08"] = "residential area",
        ["POLE-09"] = "cafe district",
        ["POLE-10"] = "mixed-use area",
        ["POLE-11"] = "office tower area",
        ["POLE-12"] = "hotel area",
    };

    public IncidentLogGenerator(
        IServiceScopeFactory scopeFactory,
        IHubContext<TelemetryHub> hubContext,
        ILogger<IncidentLogGenerator> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Incident log generator starting.");
        // Check every 30 seconds for pending work
        _timer = new Timer(Tick, null, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30));
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer?.Change(Timeout.Infinite, 0);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Called by SimulationEngine when an anomaly is generated, so we can
    /// create a follow-up incident log after a short delay.
    /// </summary>
    public void OnAnomalyDetected(DateTime timestamp, string poleId, string anomalyDescription)
    {
        // ~40% chance to generate a follow-up log for this anomaly
        if (_rng.NextDouble() < 0.4)
        {
            _pendingAnomalies.Enqueue((timestamp, poleId, anomalyDescription));
        }
    }

    private async void Tick(object? state)
    {
        try
        {
            var logs = new List<IncidentLog>();
            var now = DateTime.UtcNow;

            // Process pending anomaly follow-ups (with 1-5 min simulated delay)
            while (_pendingAnomalies.TryPeek(out var next) && next.Timestamp.AddMinutes(1) <= now)
            {
                if (!_pendingAnomalies.TryDequeue(out var item)) break;
                var log = GenerateAnomalyFollowUp(now, item.PoleId, item.AnomalyDesc);
                if (log != null)
                    logs.Add(log);
            }

            // Periodic scheduled entries (every ~2 hours of real time)
            if ((now - _lastScheduledLog).TotalMinutes >= 120)
            {
                var scheduled = GenerateScheduledEntry(now);
                if (scheduled != null)
                {
                    logs.Add(scheduled);
                    _lastScheduledLog = now;
                }
            }

            if (logs.Count > 0)
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.IncidentLogs.AddRange(logs);
                await db.SaveChangesAsync();

                // Broadcast to connected clients via SignalR
                foreach (var log in logs)
                {
                    await _hubContext.Clients.All.SendAsync("IncidentLog", new
                    {
                        log.Id, log.Timestamp, log.PoleId, log.Author, log.Category, log.Text
                    });
                }
                foreach (var l in logs)
                {
                    _logger.LogInformation("[IncidentLog] {Timestamp} {PoleId} [{Category}] {Author}: {Text}",
                        l.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"), l.PoleId, l.Category, l.Author, l.Text);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in incident log generator tick");
        }
    }

    private IncidentLog? GenerateAnomalyFollowUp(DateTime now, string poleId, string anomalyDesc)
    {
        var zone = PoleZoneNames.GetValueOrDefault(poleId, "area");
        var tech = TechnicianNames[_rng.Next(TechnicianNames.Length)];

        if (anomalyDesc.Contains("energy spike", StringComparison.OrdinalIgnoreCase))
        {
            var templates = new[]
            {
                $"Responded to energy spike alert at {poleId} in the {zone}. Found corroded wiring at junction box. Applied temporary fix, scheduled full rewiring for next maintenance window.",
                $"Investigated energy spike at {poleId}. Lamp driver board showing signs of capacitor degradation. Replaced driver unit on-site. Monitoring for recurrence over next 24 hours.",
                $"Energy spike at {poleId} traced to loose neutral connection in the panel. Retightened all terminals and applied dielectric grease. Recommend full panel inspection across {zone} within 30 days.",
                $"Attended {poleId} after energy spike alert. Found water ingress in the control compartment — door seal gasket degraded. Replaced gasket and dried internal components. No permanent damage detected.",
                $"Energy anomaly at {poleId} caused by faulty dimming controller. Unit was cycling rapidly between 40% and 100% output. Replaced controller module. Root cause: firmware bug in batch #2024-Q3 units.",
            };
            return new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = tech,
                Category = "repair",
                Text = templates[_rng.Next(templates.Length)]
            };
        }

        if (anomalyDesc.Contains("cluster", StringComparison.OrdinalIgnoreCase))
        {
            var templates = new[]
            {
                $"Pedestrian cluster alert at {poleId} ({zone}) during off-hours. Coordinated with municipal security — confirmed unauthorized gathering. Increased light output to 100% as deterrent measure. Filed incident report #IR-{_rng.Next(1000, 9999)}.",
                $"Unusual pedestrian activity detected near {poleId} in {zone}. On-site check revealed a street vendor had set up near the pole base. No safety concern, but notified city enforcement. Light output was already at adaptive maximum.",
                $"Multiple pedestrian alerts at {poleId} overnight. Security camera footage shows group of teenagers congregating. No vandalism detected. Recommend installing anti-loitering audio deterrent at this location.",
                $"Off-hours crowd detected at {poleId} in the {zone}. Investigation found a burst water main attracting onlookers. Notified water utility. Increased illumination to support emergency response crews.",
            };
            return new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = _rng.NextDouble() < 0.5 ? tech : "Control Room Operator",
                Category = "incident",
                Text = templates[_rng.Next(templates.Length)]
            };
        }

        if (anomalyDesc.Contains("sensor dropout", StringComparison.OrdinalIgnoreCase))
        {
            var templates = new[]
            {
                $"Sensor dropout at {poleId}. On-site inspection found spider nest blocking ambient light sensor aperture. Cleaned sensor housing and applied insect-repellent coating. All readings back to normal.",
                $"Null readings from {poleId} sensors. Traced to corroded data cable at the base connector. Replaced cable and sealed connector with waterproof compound. Recommend proactive cable replacement across aging poles in {zone}.",
                $"Sensor malfunction at {poleId} — intermittent null readings on pedestrian counter. PIR sensor lens had micro-cracks from UV exposure. Replaced with UV-resistant unit. Added to fleet-wide lens replacement schedule.",
                $"Investigated sensor dropout at {poleId}. Root cause: firmware crash due to memory leak in v3.2.1. Rebooted controller and applied hotfix v3.2.2. Escalated to vendor for permanent patch.",
            };
            return new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = tech,
                Category = "maintenance",
                Text = templates[_rng.Next(templates.Length)]
            };
        }

        if (anomalyDesc.Contains("air quality", StringComparison.OrdinalIgnoreCase))
        {
            var templates = new[]
            {
                $"AQI spike at {poleId} not correlated with traffic patterns. Checked for local sources — found construction debris from nearby renovation being carried by wind. Notified building management. Sensor readings validated against portable reference unit.",
                $"Unexplained air quality degradation near {poleId}. Cross-referenced with city environmental monitoring: localized event, not regional. Suspect illegal waste burning in adjacent lot. Reported to environmental compliance.",
            };
            return new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = AutoSystems[_rng.Next(AutoSystems.Length)],
                Category = "incident",
                Text = templates[_rng.Next(templates.Length)]
            };
        }

        return null;
    }

    private IncidentLog? GenerateScheduledEntry(DateTime now)
    {
        var poleIndex = _rng.Next(12);
        var poleId = $"POLE-{poleIndex + 1:D2}";
        var zone = PoleZoneNames.GetValueOrDefault(poleId, "area");
        var tech = TechnicianNames[_rng.Next(TechnicianNames.Length)];

        var type = _rng.Next(4);
        return type switch
        {
            0 => new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = tech,
                Category = "inspection",
                Text = $"Routine quarterly inspection of {poleId} in the {zone}. Lamp housing in good condition. Sensor calibration verified against reference instruments — all within spec. Pole structure shows no corrosion. Panel door seal intact. Next scheduled inspection in 90 days."
            },
            1 => new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = "Predictive Maintenance AI",
                Category = "scheduled",
                Text = $"Predictive model flags {poleId} for preventive lamp replacement. Current lamp has {_rng.Next(8000, 12000)} operating hours (rated for 15000). Light output degradation estimated at {_rng.Next(8, 18)}% based on trend analysis. Scheduling replacement during next planned maintenance window to avoid unplanned outage in the {zone}."
            },
            2 => new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = tech,
                Category = "maintenance",
                Text = $"Performed scheduled cleaning of all sensors on {poleId}. Ambient light sensor had dust accumulation affecting readings by ~{_rng.Next(3, 12)}%. PIR motion sensor lenses cleaned. Humidity sensor membrane replaced as part of annual cycle. Post-cleaning calibration check passed."
            },
            _ => new IncidentLog
            {
                Timestamp = now,
                PoleId = poleId,
                Author = "AutoDiag System",
                Category = "scheduled",
                Text = $"Automated diagnostics report for {poleId}: Communication latency {_rng.Next(2, 15)}ms (nominal <50ms). Power factor 0.{_rng.Next(92, 99)}. LED driver efficiency {_rng.Next(88, 96)}%. Battery backup capacity {_rng.Next(85, 100)}%. All parameters within operational limits. No action required."
            }
        };
    }

    public void Dispose()
    {
        _timer?.Dispose();
    }
}
