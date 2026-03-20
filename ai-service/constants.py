"""Shared constants for the CogniLight AI service."""

# Pole-to-zone mapping — mirrors backend SimulationEngine.ZoneNames
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
    "POLE-11": "Office Tower",
    "POLE-12": "Hotel",
}

# Zone activity descriptions for LLM prompt context
POLE_ZONE_DESCRIPTIONS: dict[str, str] = {
    "POLE-01": "Office district — busy 8-18h, dead at night",
    "POLE-02": "Retail strip — busy 10-20h, quiet overnight",
    "POLE-03": "Park — morning/evening pedestrian & cyclist peaks, empty at night",
    "POLE-04": "School zone — sharp peaks at 7:30-8:30 and 15-16h (drop-off/pickup), empty nights",
    "POLE-05": "Mall area — busy 10-21h, moderate evening, quiet overnight",
    "POLE-06": "Apartment complex — morning/evening rush, low daytime, some overnight",
    "POLE-07": "Gym — early morning (6-8h) and after-work (17-21h) peaks",
    "POLE-08": "Residential — morning/evening commute peaks, quiet during work hours",
    "POLE-09": "Cafe district — morning coffee rush (7-10h), lunch peak (12-14h), quiet at night",
    "POLE-10": "Mixed-use area — moderate activity throughout the day",
    "POLE-11": "Office tower — high vehicle traffic during commute, busy work hours, dead at night",
    "POLE-12": "Hotel — steady activity all day, moderate overnight presence",
}

# Columns returned by SELECT * from TelemetryReadings
TELEMETRY_COLUMNS = [
    "Id", "PoleId", "Timestamp", "EnergyWatts", "PedestrianCount",
    "VehicleCount", "CyclistCount", "AmbientLightLux", "TemperatureC",
    "HumidityPct", "AirQualityAqi", "NoiseDb", "LightLevelPct",
    "AnomalyFlag", "AnomalyDescription",
]
