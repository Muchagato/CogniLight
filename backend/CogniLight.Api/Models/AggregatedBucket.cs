namespace CogniLight.Api.Models;

public record AggregatedBucket(
    DateTime BucketStart,
    double TotalEnergy,
    double TotalPedestrians,
    double TotalVehicles,
    double TotalCyclists,
    double AvgTemperature,
    double AvgHumidity,
    double AvgAqi,
    double AvgNoise,
    int AnomalyCount);

public record PoleBucket(
    DateTime BucketStart,
    double AvgEnergy,
    double AvgPedestrians,
    double AvgVehicles,
    double AvgCyclists,
    double AvgAqi,
    double AvgNoise,
    double AvgTemperature,
    double AvgHumidity,
    double AvgLightLevel,
    int AnomalyCount);
