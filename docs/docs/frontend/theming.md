# Theme System

CogniLight uses a dark theme with amber and cyan accents, centralized across three files. This page explains why three files are necessary and how to modify the theme.

---

## The Three-File Problem

In a typical web app, you'd define colors once in CSS custom properties and reference them everywhere. CogniLight can't do this because it has three rendering contexts with different APIs:

| Context | Technology | Can Read CSS Vars? | Color Source |
|---------|-----------|-------------------|-------------|
| Components (SCSS) | Angular templates + SCSS | Yes | `theme.scss` |
| Canvas renderer | HTML5 Canvas 2D API | No | `renderer/theme.ts` |
| ECharts options | JavaScript objects | No | `shared/chart-theme.ts` |

Canvas 2D's `fillStyle` and `strokeStyle` accept color strings directly — there's no DOM element to call `getComputedStyle()` on (and doing so per-frame would be a performance issue). Similarly, ECharts options are plain JavaScript objects set before rendering — they can't reference CSS variables.

---

## File 1: `theme.scss` (CSS Custom Properties)

The single source of truth for all SCSS-based components. Every color is a CSS custom property on `:root`:

```scss
:root {
  // Surfaces
  --cl-bg-base: #0c0e12;         // Page background
  --cl-bg-raised: #14171e;       // Cards, panels, nav
  --cl-bg-inset: #181c24;        // Inset areas
  --cl-bg-hover: #1e2230;        // Hover states
  --cl-bg-active: #262b3a;       // Active/pressed

  // Text
  --cl-text-primary: #e8ecf4;
  --cl-text-secondary: #cbd5e1;
  --cl-text-muted: #94a3b8;
  --cl-text-faint: #64748b;

  // Accents
  --cl-amber: #f59e0b;           // Brand / lighting
  --cl-cyan: #22d3ee;            // Data / selection
  // ...
}
```

Components reference these via `var(--cl-amber)`, never hardcoded hex values.

**Naming convention:** `--cl-` prefix (CogniLight), then category (`bg`, `text`, `amber`, `cyan`), then variant (`base`, `raised`, `hover`, etc.).

---

## File 2: `renderer/theme.ts` (Canvas Constants)

TypeScript constants for the canvas renderer:

```typescript
export const RT = {
  skyDay: '#14171e',
  skyNight: '#0c0e12',
  ground: '#181c24',
  road: '#262b3a',
  poleDefault: '#f59e0b',
  poleSelected: '#06b6d4',
  poleAnomaly: '#ef4444',
  pedestrian: '#22d3ee',
  vehicle: '#fbbf24',
  cyclist: '#a78bfa',
  headlight: '#fef3c7',
  // ...
} as const;
```

Each value has a comment linking it to the corresponding CSS variable. The `as const` assertion ensures these are literal types, not just `string`.

### Special Case: Glow Color

Pole glow effects need an RGB tuple for `rgba()` construction:

```typescript
poleGlowColor: [245, 158, 11] as readonly [number, number, number],
```

This is used to create gradients with varying alpha:

```typescript
ctx.fillStyle = `rgba(${RT.poleGlowColor.join(',')}, ${alpha})`;
```

---

## File 3: `shared/chart-theme.ts` (ECharts Constants)

TypeScript constants for ECharts configuration objects:

```typescript
export const CT = {
  tooltipBg: '#181c24',
  tooltipBorder: '#252a36',
  tooltipText: '#cbd5e1',
  axisLabel: '#64748b',
  energy: '#f59e0b',
  pedestrian: '#0891b2',
  vehicle: '#d97706',
  cyclist: '#7c3aed',
  temperature: '#ef4444',
  humidity: '#3b82f6',
  aqi: '#16a34a',
};
```

Plus shared style objects that are spread into chart options:

```typescript
export const TOOLTIP_STYLE = {
  backgroundColor: CT.tooltipBg,
  borderColor: CT.tooltipBorder,
  textStyle: { color: CT.tooltipText },
};

export const AXIS_LABEL = {
  color: CT.axisLabel,
  fontSize: 10,
  hideOverlap: true,
};
```

---

## Color Palette

### Surfaces (Dark → Light)

| Token | Hex | Usage |
|-------|-----|-------|
| `--cl-bg-base` | `#0c0e12` | Page background, canvas |
| `--cl-bg-raised` | `#14171e` | Cards, panels, nav bar |
| `--cl-bg-inset` | `#181c24` | Inset areas, tooltips |
| `--cl-bg-hover` | `#1e2230` | Hover rows, interactive elements |
| `--cl-bg-active` | `#262b3a` | Active/pressed states, roads |

### Accents

| Token | Hex | Meaning |
|-------|-----|---------|
| `--cl-amber` | `#f59e0b` | Brand / street lighting / energy |
| `--cl-cyan` | `#22d3ee` | Data / selection / interactivity |

### Data Colors

| Token | Hex | Used For |
|-------|-----|---------|
| Energy | `#f59e0b` | Energy charts, pole glow |
| Pedestrian | `#0891b2` / `#22d3ee` | Traffic charts, entity dots |
| Vehicle | `#d97706` / `#fbbf24` | Traffic charts, vehicle rectangles |
| Cyclist | `#7c3aed` / `#a78bfa` | Traffic charts, cyclist dots |
| Temperature | `#ef4444` | Environmental chart |
| Humidity | `#3b82f6` | Environmental chart |
| AQI | `#16a34a` | Environmental chart |

### Status

| Token | Hex | Meaning |
|-------|-----|---------|
| `--cl-green` | `#22c55e` | Normal / connected |
| `--cl-red` | `#ef4444` | Anomaly / error |
| `--cl-warning` | `#eab308` | Warning state |

---

## How to Change the Theme

1. Edit `theme.scss` — change CSS custom properties
2. Update `renderer/theme.ts` — match the canvas constants
3. Update `shared/chart-theme.ts` — match the ECharts constants

Each file has a header comment explaining its relationship to the others.
