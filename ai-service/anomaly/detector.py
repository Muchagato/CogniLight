"""Rule-based anomaly detection with LLM summarization."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class AnomalyReport:
    pole_id: str
    timestamp: str
    anomaly_type: str
    description: str
    severity: str  # "low", "medium", "high"


def detect_anomalies(readings: list[dict[str, Any]]) -> list[AnomalyReport]:
    """Detect anomalies from a batch of telemetry readings."""
    reports: list[AnomalyReport] = []

    for r in readings:
        if not r.get("anomalyFlag"):
            continue

        pole_id = r.get("poleId", "unknown")
        timestamp = r.get("timestamp", "")
        desc = r.get("anomalyDescription", "Unknown anomaly")

        # Classify severity
        energy = r.get("energyWatts", 0)
        aqi = r.get("airQualityAqi", 0)

        if energy > 230:
            severity = "high"
            anomaly_type = "energy_spike"
        elif aqi > 120:
            severity = "high"
            anomaly_type = "air_quality"
        elif r.get("pedestrianCount", 0) > 30:
            severity = "medium"
            anomaly_type = "crowd_cluster"
        else:
            severity = "low"
            anomaly_type = "sensor_issue"

        reports.append(AnomalyReport(
            pole_id=pole_id,
            timestamp=timestamp,
            anomaly_type=anomaly_type,
            description=desc,
            severity=severity,
        ))

    return reports


def summarize_anomalies(reports: list[AnomalyReport]) -> str:
    """Generate a text summary of anomaly reports."""
    if not reports:
        return "No anomalies detected in the current data window."

    high = [r for r in reports if r.severity == "high"]
    medium = [r for r in reports if r.severity == "medium"]
    low = [r for r in reports if r.severity == "low"]

    lines = [f"Anomaly Summary: {len(reports)} total detected."]
    if high:
        lines.append(f"  HIGH ({len(high)}): " + "; ".join(
            f"{r.pole_id} - {r.description}" for r in high[:3]
        ))
    if medium:
        lines.append(f"  MEDIUM ({len(medium)}): " + "; ".join(
            f"{r.pole_id} - {r.description}" for r in medium[:3]
        ))
    if low:
        lines.append(f"  LOW ({len(low)}): {len(low)} minor issues")

    return "\n".join(lines)
