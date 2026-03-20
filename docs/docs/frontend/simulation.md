# Street Simulation

The street simulation is a 2D top-down rendering of a city block, drawn on an HTML5 Canvas. Animated entities (pedestrians, vehicles, cyclists) move around 12 light poles, with their counts driven by real-time telemetry from the backend.

---

## Architecture

The rendering system is split into focused modules:

```
SimulationComponent (Angular)
  └── SimulationRenderer (orchestrator)
        ├── IsoProjection         — world → screen coordinate mapping
        ├── EntityManager          — entity spawn/fade lifecycle
        ├── GroundLayer           — roads, sidewalks, lane markings
        ├── BuildingsLayer        — building extrusions with labels
        ├── EntitiesLayer         — pedestrian/vehicle/cyclist drawing
        ├── PolesLayer            — pole circles, glow, anomaly rings
        └── OverlaysLayer         — pole ID labels, selection indicators
```

### The Component–Renderer Split

`SimulationComponent` is a thin Angular wrapper that:

1. Subscribes to `TelemetryService` observables
2. Passes data into the renderer via `updateReadings()` and `updateTime()`
3. Runs the animation loop outside Angular's zone

```typescript
// Run animation loop outside Angular zone for performance
this.zone.runOutsideAngular(() => this.renderer.startLoop());
```

`SimulationRenderer` is a plain TypeScript class (no Angular dependency). This separation means:

- The renderer can be tested without Angular
- The 60fps animation loop doesn't trigger change detection
- Canvas logic is isolated from component lifecycle

---

## World Coordinate System

The simulation uses a 100×100 world coordinate system. All positions are defined in world units and projected to screen pixels by `IsoProjection`:

```typescript
export const WORLD_SIZE = 100;
```

### Road Layout

Three roads form an intersection:

| Road | Axis | Center | Width | Description |
|------|------|--------|-------|-------------|
| Left street | Y | 27 | 8 | Runs vertically on the left |
| Right street | Y | 73 | 8 | Runs vertically on the right |
| Crossroad | X | 50 | 8 | Runs horizontally, connecting both streets |

Sidewalks extend 2.5 world units on each side of every road.

### Building Layout

11 buildings with varying heights (for extrusion effect):

| Building | Position | Height | Notes |
|----------|----------|--------|-------|
| Office | (4, 4) 15×18 | 12 | Tall office block |
| Retail | (4, 25) 15×15 | 6 | Low retail strip |
| Mall | (39, 4) 22×12 | 8 | Wide shopping area |
| Tower | (81, 4) 14×38 | 20 | Tallest structure |
| Park | (4, 60) 15×14 | 2 | Nearly flat (grass) |
| ... | | | |

### Pole Positions

Poles are positioned along the streets, each with a defined road segment for vehicle spawning:

```typescript
export const POLES: PoleDef[] = [
  {
    poleId: 'POLE-01',
    wx: 22, wy: 12,
    roadSegment: { streetIndex: 0, start: 0, end: 23 }
  },
  ...
];
```

The `roadSegment` defines where vehicles can spawn along the pole's monitored road section.

---

## Entity Management

`EntityManager` handles the lifecycle of animated entities: spawning, fading in, and fading out.

### Sync Algorithm

Every time new telemetry arrives, `syncWithReadings()` adjusts entity counts per pole:

```
For each pole, for each entity type (pedestrian, vehicle, cyclist):
  current = active entities of this type at this pole
  target  = reading from backend (capped for visual clarity)

  if current < target → spawn (target - current) new entities
  if current > target → mark excess as 'exiting' (fade out)
```

Entity counts are capped per pole for visual clarity:

- Pedestrians: max 8 per pole
- Vehicles: max 5 per pole
- Cyclists: max 3 per pole

### Entity States

Each entity goes through three states:

```
entering (opacity 0→1) → active (opacity 1) → exiting (opacity 1→0) → removed
```

- **Entering:** Opacity ramps up at 2.0 per second
- **Exiting:** Opacity ramps down at 3.0 per second (faster exit for visual crispness)
- **Removal:** Entities are garbage-collected when opacity reaches 0

### Spawn Placement

- **Pedestrians:** Random position within the pole's zone radius, on sidewalks (not on roads or inside buildings)
- **Vehicles:** Random position along the pole's assigned road segment
- **Cyclists:** Similar to vehicles but constrained to road edges

Collision avoidance with buildings is done via `isInsideBuilding()`, which checks against all building footprints with a configurable margin.

---

## Rendering Pipeline

Each frame follows a fixed draw order (painter's algorithm — back to front):

1. **Clear canvas** with sky color (interpolated between day/night based on hour)
2. **Ground layer** — road surfaces, sidewalks, lane markings
3. **Buildings** — filled rectangles with stroke, sorted for pseudo-3D effect
4. **Entities** — drawn with their current opacity (fade in/out)
5. **Poles** — sensor radius circles, pole dots, glow effects (at night), anomaly rings
6. **Overlays** — pole ID labels, selection highlights

### Night Lighting

At night (ambient light < threshold), poles emit a radial gradient glow:

- Color: amber (`#f59e0b`) at varying opacity
- Radius: proportional to the pole's light output level
- Selected poles glow cyan instead of amber

### Click Interaction

Pole click detection uses hit-testing: on canvas click, convert screen coordinates to world coordinates, then check distance to each pole. If within the pole's visual radius, emit a selection event.

```typescript
canvas.addEventListener('click', this.clickHandler);
// clickHandler → convert (screenX, screenY) to (worldX, worldY) → find nearest pole
```

The `ResizeObserver` watches the canvas parent for size changes (e.g., when the simulation panel collapses/expands), triggering a canvas resize.

---

## Performance Considerations

- **`requestAnimationFrame`** — the rendering loop uses rAF for smooth 60fps
- **Outside NgZone** — the entire animation loop runs outside Angular's zone
- **No DOM per entity** — all entities are drawn directly on the canvas
- **Entity cap** — counts are capped per pole to prevent visual clutter and rendering overhead
- **Delta time** — the `update(dt)` method receives elapsed time since last frame, making animations frame-rate independent
