"""Shared constants for the CogniLight AI service."""

# Pole-to-zone mapping — mirrors backend SimulationEngine.PoleZones
POLE_ZONES: dict[str, str] = {
    "POLE-01": "Office",
    "POLE-02": "Retail",
    "POLE-03": "Park",
    "POLE-04": "School",
    "POLE-05": "Mall",
    "POLE-06": "Apartment",
    "POLE-07": "Gym",
    "POLE-08": "Residential",
    "POLE-09": "Cafe",
    "POLE-10": "Mixed-use",
    "POLE-11": "Tower",
    "POLE-12": "Hotel",
}

# Columns returned by SELECT * from TelemetryReadings
TELEMETRY_COLUMNS = [
    "Id", "PoleId", "Timestamp", "EnergyWatts", "PedestrianCount",
    "VehicleCount", "CyclistCount", "AmbientLightLux", "TemperatureC",
    "HumidityPct", "AirQualityAqi", "NoiseDb", "LightLevelPct",
    "AnomalyFlag", "AnomalyDescription",
]
