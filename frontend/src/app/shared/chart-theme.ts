// =============================================================================
// ECharts Theme Constants
// =============================================================================
// ECharts options are set via JS objects, not CSS. Keep in sync with theme.scss.
// =============================================================================

export const CT = {
  // --- Tooltip ---
  tooltipBg: '#181c24',
  tooltipBorder: '#252a36',
  tooltipText: '#cbd5e1',

  // --- Axes ---
  axisLabel: '#64748b',
  axisLine: '#252a36',
  splitLine: '#1c2028',

  // --- Legend ---
  legendText: '#94a3b8',

  // --- Radar ---
  radarSplitArea1: '#14171e',
  radarSplitArea2: '#181c24',
  radarAxisName: '#94a3b8',

  // --- Series Colors ---
  energy: '#f59e0b',
  energyArea: 'rgba(245,158,11,0.08)',
  pedestrian: '#0891b2',
  pedestrianArea: 'rgba(8,145,178,0.1)',
  vehicle: '#d97706',
  cyclist: '#7c3aed',
  temperature: '#ef4444',
  humidity: '#3b82f6',
  aqi: '#16a34a',
  noise: '#a78bfa',
} as const;

/** Shared tooltip style */
export const TOOLTIP_STYLE = {
  backgroundColor: CT.tooltipBg,
  borderColor: CT.tooltipBorder,
  textStyle: { color: CT.tooltipText },
} as const;

/** Shared axis label style */
export const AXIS_LABEL = {
  color: CT.axisLabel,
  fontSize: 10,
  hideOverlap: true,
} as const;

/** Shared axis line style */
export const AXIS_LINE = {
  lineStyle: { color: CT.axisLine },
} as const;

/** Shared split line style */
export const SPLIT_LINE = {
  lineStyle: { color: CT.splitLine },
} as const;
