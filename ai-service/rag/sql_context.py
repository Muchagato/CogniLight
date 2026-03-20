"""Direct SQL context builder — provides fresh telemetry state for every LLM prompt."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from constants import POLE_ZONES, TELEMETRY_COLUMNS


@dataclass
class SqlQueryInfo:
    """Metadata about a SQL query executed for context."""
    label: str
    query: str
    row_count: int
    columns: list[str] = field(default_factory=list)
    rows: list[list[Any]] = field(default_factory=list)


@dataclass
class SqlContextResult:
    """Bundle of formatted context text and query metadata."""
    text: str
    queries: list[SqlQueryInfo] = field(default_factory=list)


_SNAPSHOT_SQL = (
    "SELECT * FROM TelemetryReadings "
    "WHERE Id IN (SELECT MAX(Id) FROM TelemetryReadings GROUP BY PoleId) "
    "ORDER BY PoleId"
)
_ANOMALY_SQL = (
    "SELECT PoleId, Timestamp, AnomalyDescription "
    "FROM TelemetryReadings "
    "WHERE AnomalyFlag = 1 ORDER BY Id DESC LIMIT 20"
)
_TIME_RANGE_SQL = "SELECT MIN(Timestamp), MAX(Timestamp) FROM TelemetryReadings"


def build_sql_context(engine: Engine) -> SqlContextResult:
    """Query SQLite and return formatted text + query metadata."""
    queries: list[SqlQueryInfo] = []

    with engine.connect() as conn:
        # Latest reading per pole
        snapshot_rows = conn.execute(text(_SNAPSHOT_SQL)).fetchall()
        _SNAPSHOT_COLS = ["Pole", "Zone", "Energy", "Ped", "Veh", "Cyc", "AQI", "Temp", "Noise", "Light%", "Anomaly"]
        snapshot_display: list[list[Any]] = []
        for row in snapshot_rows:
            r = dict(zip(TELEMETRY_COLUMNS, row))
            snapshot_display.append([
                r["PoleId"], POLE_ZONES.get(r["PoleId"], "?"),
                f"{r['EnergyWatts']:.0f}W", r["PedestrianCount"],
                r["VehicleCount"], r["CyclistCount"], r["AirQualityAqi"],
                f"{r['TemperatureC']:.1f}", f"{r['NoiseDb']:.0f}",
                f"{r['LightLevelPct']:.0f}%",
                r["AnomalyDescription"] if r["AnomalyFlag"] else "-",
            ])
        queries.append(SqlQueryInfo(
            "Latest reading per pole", _SNAPSHOT_SQL, len(snapshot_rows),
            _SNAPSHOT_COLS, snapshot_display,
        ))

        # Recent anomalies (last 20)
        anomaly_rows = conn.execute(text(_ANOMALY_SQL)).fetchall()
        queries.append(SqlQueryInfo(
            "Recent anomalies", _ANOMALY_SQL, len(anomaly_rows),
            ["Pole", "Timestamp", "Description"],
            [[str(c) for c in row] for row in anomaly_rows],
        ))

        # Simulation time range
        time_range = conn.execute(text(_TIME_RANGE_SQL)).fetchone()
        queries.append(SqlQueryInfo(
            "Simulation time range", _TIME_RANGE_SQL, 1 if time_range else 0,
            ["Min", "Max"],
            [[str(time_range[0]), str(time_range[1])]] if time_range else [],
        ))

    if not snapshot_rows:
        return SqlContextResult("No telemetry data available yet.", queries)

    snapshot = [dict(zip(TELEMETRY_COLUMNS, row)) for row in snapshot_rows]

    # --- Network totals ---
    total_energy = sum(r["EnergyWatts"] for r in snapshot)
    total_ped = sum(r["PedestrianCount"] for r in snapshot)
    total_veh = sum(r["VehicleCount"] for r in snapshot)
    total_cyc = sum(r["CyclistCount"] for r in snapshot)
    avg_aqi = sum(r["AirQualityAqi"] for r in snapshot) / len(snapshot)
    avg_temp = sum(r["TemperatureC"] for r in snapshot) / len(snapshot)
    active_anomalies = sum(1 for r in snapshot if r["AnomalyFlag"])
    sim_time = snapshot[0]["Timestamp"]

    lines: list[str] = []
    lines.append(f"--- CURRENT NETWORK STATE (simulation time: {sim_time}) ---")
    lines.append(
        f"Network totals: {total_energy:.0f}W energy, "
        f"{total_ped} pedestrians, {total_veh} vehicles, {total_cyc} cyclists"
    )
    lines.append(
        f"Avg AQI: {avg_aqi:.0f} | Avg Temp: {avg_temp:.1f}C | "
        f"Active anomalies: {active_anomalies}"
    )
    if time_range:
        lines.append(f"Simulation range: {time_range[0]} to {time_range[1]}")

    # --- Per-pole table ---
    lines.append("")
    lines.append("Per-pole current readings:")
    lines.append("| Pole | Zone | Energy | Ped | Veh | Cyc | AQI | Temp | Noise | Light% | Anomaly |")
    lines.append("|------|------|--------|-----|-----|-----|-----|------|-------|--------|---------|")
    for r in snapshot:
        zone = POLE_ZONES.get(r["PoleId"], "?")
        anomaly = r["AnomalyDescription"] if r["AnomalyFlag"] else "-"
        lines.append(
            f"| {r['PoleId']} | {zone} | {r['EnergyWatts']:.0f}W | "
            f"{r['PedestrianCount']} | {r['VehicleCount']} | {r['CyclistCount']} | "
            f"{r['AirQualityAqi']} | {r['TemperatureC']:.1f}C | "
            f"{r['NoiseDb']:.0f}dB | {r['LightLevelPct']:.0f}% | {anomaly} |"
        )

    # --- Rankings ---
    by_energy = sorted(snapshot, key=lambda r: r["EnergyWatts"], reverse=True)
    by_traffic = sorted(
        snapshot,
        key=lambda r: r["PedestrianCount"] + r["VehicleCount"] + r["CyclistCount"],
        reverse=True,
    )
    lines.append("")
    lines.append("Top energy consumers: " + ", ".join(
        f"{r['PoleId']} ({POLE_ZONES.get(r['PoleId'], '?')}, {r['EnergyWatts']:.0f}W)"
        for r in by_energy[:3]
    ))
    lines.append("Top traffic poles: " + ", ".join(
        f"{r['PoleId']} ({POLE_ZONES.get(r['PoleId'], '?')}, "
        f"{r['PedestrianCount'] + r['VehicleCount'] + r['CyclistCount']} total)"
        for r in by_traffic[:3]
    ))

    # --- Recent anomalies ---
    if anomaly_rows:
        lines.append("")
        lines.append("Recent anomalies:")
        for pole_id, ts, desc in anomaly_rows:
            zone = POLE_ZONES.get(pole_id, "?")
            lines.append(f"- {ts} {pole_id} ({zone}): {desc}")

    lines.append("--- END CURRENT STATE ---")
    return SqlContextResult("\n".join(lines), queries)
