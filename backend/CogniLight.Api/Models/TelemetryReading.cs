namespace CogniLight.Api.Models;

public class TelemetryReading
{
    public long Id { get; set; }
    public required string PoleId { get; set; }
    public DateTime Timestamp { get; set; }
    public double EnergyWatts { get; set; }
    public int PedestrianCount { get; set; }
    public int VehicleCount { get; set; }
    public int CyclistCount { get; set; }
    public double AmbientLightLux { get; set; }
    public double TemperatureC { get; set; }
    public double HumidityPct { get; set; }
    public int AirQualityAqi { get; set; }
    public double NoiseDb { get; set; }
    public double LightLevelPct { get; set; }
    public bool AnomalyFlag { get; set; }
    public string? AnomalyDescription { get; set; }
}
