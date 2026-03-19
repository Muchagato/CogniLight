// =============================================================================
// Canvas Renderer Theme
// =============================================================================
// Canvas 2D context can't read CSS variables, so renderer colors live here.
// Keep in sync with /app/theme.scss when changing themes.
// =============================================================================

export const RT = {
  // --- Sky ---
  skyDay: '#14171e',       // matches --cl-bg-raised
  skyNight: '#0c0e12',     // matches --cl-bg-base

  // --- Ground ---
  ground: '#181c24',       // matches --cl-bg-inset
  sidewalk: '#1e2230',     // matches --cl-bg-hover
  road: '#262b3a',         // matches --cl-bg-active
  laneMarking: '#f59e0b33',

  // --- Buildings ---
  buildingFill: '#14171e', // matches --cl-bg-raised
  buildingStroke: '#252a36', // matches --cl-border
  buildingLabel: '#64748b',  // matches --cl-text-faint

  // --- Poles ---
  poleDefault: '#f59e0b',
  poleSelected: '#06b6d4',
  poleAnomaly: '#ef4444',
  poleAnomalyRing: '#ef444466',
  poleSensorDefault: '#f59e0b11',
  poleSensorSelected: '#06b6d422',
  poleSelectionRing: '#06b6d444',
  poleGlowColor: [245, 158, 11] as readonly [number, number, number], // RGB for rgba()

  // --- Entities ---
  pedestrian: '#22d3ee',
  vehicle: '#fbbf24',
  cyclist: '#a78bfa',
  headlight: '#fef3c7',

  // --- Labels ---
  labelDefault: '#64748b',
  labelSelected: '#06b6d4',
} as const;
