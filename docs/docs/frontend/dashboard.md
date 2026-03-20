# Telemetry Dashboard

The dashboard is the primary data visualization surface. It displays real-time KPIs, time-series charts, per-pole detail tables, and anomaly/incident logs — all updated live via SignalR.

---

## Layout

The dashboard uses a vertical grid of sections:

```
┌──────────────────────────────────────────────────┐
│  KPI Cards  [Energy] [Peds] [Vehicles] [AQI] [!] │
├──────────────────────────────────────────────────┤
│  Time Range Selector  [LIVE] [5m] [15m] [1h] ... │
├──────────┬───────────┬───────────────────────────┤
│ Energy   │ Traffic   │ Environmental              │
│ Chart    │ Chart     │ Chart                      │
│ (line)   │ (stacked) │ (multi-axis)               │
├──────────┴───────────┴───────────────────────────┤
│  Per-Pole Table          │ Radar Chart (selected)  │
├──────────────────────────┤                         │
│  Anomaly Log             │                         │
├──────────────────────────┤                         │
│  Incident Log            │                         │
└──────────────────────────┴─────────────────────────┘
```

---

## KPI Cards

Five summary cards at the top:

| Card | Value | Source |
|------|-------|--------|
| Total Energy | Sum of all poles' `energyWatts` | Live readings |
| Pedestrians | Sum of all `pedestrianCount` | Live readings |
| Vehicles | Sum of all `vehicleCount` | Live readings |
| Avg AQI | Mean of all `airQualityAqi` | Live readings |
| Anomalies | Count of poles with `anomalyFlag` | Live readings |

These update every second as new readings arrive via SignalR.

---

## Time Range System

The dashboard supports both live streaming and historical time ranges:

| Range | Duration | Bucket | Data Source |
|-------|----------|--------|-------------|
| **LIVE** | Rolling 120 snapshots | Raw (1s) | SignalR + in-memory buffer |
| **5m** | 5 minutes | 1s | REST: `/api/telemetry/history` |
| **15m** | 15 minutes | 5s | REST: `/api/telemetry/history` |
| **1h** | 1 hour | 10s | REST: `/api/telemetry/history` |
| **6h** | 6 hours | 60s | REST: `/api/telemetry/history` |
| **1d** | 1 day | 5 min | REST: `/api/telemetry/history` |
| **3d** | 3 days | 15 min | REST: `/api/telemetry/history` |

**LIVE mode** uses the in-memory rolling window in `TelemetryService` — no REST calls. When switching to a historical range, the dashboard:

1. Computes the time window (`from = now - duration`, `to = now`)
2. Fetches bucketed data via REST
3. Also fetches anomalies and incidents for the same range
4. Disconnects from the live SignalR stream for charts (KPIs still update live)

### Per-Pole Drill-Down

When a pole is selected (via canvas click or table row), charts switch from network-wide to single-pole data:

- Chart titles update: "Energy Consumption" → "POLE-07 Energy"
- Data source changes to `getPoleHistory()` REST endpoint
- A radar chart appears showing the selected pole's metrics normalized against the network

---

## Charts (ECharts)

Three time-series charts render via `ngx-echarts`:

### Energy Consumption

A line chart with an area fill showing total network energy (or single-pole energy when selected).

- Color: Amber (`#f59e0b`) — matches the lighting accent
- Area fill: `rgba(245,158,11,0.08)` — subtle gradient

### Traffic Density

A stacked area chart with three series:

- Pedestrians: Teal (`#0891b2`)
- Vehicles: Orange (`#d97706`)
- Cyclists: Purple (`#7c3aed`)

### Environmental

A multi-axis chart with three series sharing the time axis:

- Temperature: Red (`#ef4444`) — left axis
- Humidity: Blue (`#3b82f6`) — right axis
- AQI: Green (`#16a34a`) — second right axis

### Chart Theme

Charts use a dedicated theme system (`shared/chart-theme.ts`) because ECharts options are JavaScript objects, not DOM elements:

```typescript
export const CT = {
  tooltipBg: '#181c24',
  tooltipBorder: '#252a36',
  tooltipText: '#cbd5e1',
  axisLabel: '#64748b',
  axisLine: '#252a36',
  splitLine: '#1c2028',
  energy: '#f59e0b',
  pedestrian: '#0891b2',
  vehicle: '#d97706',
  cyclist: '#7c3aed',
  temperature: '#ef4444',
  humidity: '#3b82f6',
  aqi: '#16a34a',
};
```

Shared style objects (`TOOLTIP_STYLE`, `AXIS_LABEL`, `AXIS_LINE`, `SPLIT_LINE`) are exported for reuse across charts.

---

## Per-Pole Table

A table showing current readings for all 12 poles:

| POLE-01 | Office | 142W | 3 ped | 2 veh | 1 cyc | AQI 46 |

Clicking a row selects that pole, triggering:

1. Chart data switch to single-pole view
2. Simulation canvas highlights the pole
3. Radar chart appears

---

## Anomaly Log

A timestamped list of recent anomalies:

```
14:23:01  POLE-07  Sudden energy spike — possible malfunction
14:21:45  POLE-04  Unusual pedestrian cluster (school zone) during off-hours
```

In LIVE mode, this updates in real time from SignalR events. In historical mode, it fetches from `/api/telemetry/anomalies/range`.

---

## Incident Log

A separate panel showing maintenance/incident reports from the `IncidentLogGenerator`:

```
14:25:00  POLE-07  [repair] Technician Silva
  "Investigated energy spike at POLE-07. Lamp driver board showing signs of..."
```

These provide richer narrative context than the one-line anomaly descriptions.
