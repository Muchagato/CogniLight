export const WORLD_SIZE = 100;

// --- Roads ---
// Each road is defined by its axis, center position, and width in world units

export interface RoadDef {
  axis: 'x' | 'y';
  center: number;
  width: number;
}

export const ROADS: RoadDef[] = [
  { axis: 'y', center: 27, width: 8 },   // Left street (runs along Y)
  { axis: 'y', center: 73, width: 8 },   // Right street (runs along Y)
  { axis: 'x', center: 50, width: 8 },   // Crossroad (runs along X)
];

// Sidewalk width in world units
export const SIDEWALK_WIDTH = 2.5;

// --- Buildings ---

export interface BuildingDef {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number; // extrusion height in world units
  label: string;
}

export const BUILDINGS: BuildingDef[] = [
  { x: 4, y: 4, w: 15, h: 18, height: 12, label: 'Office' },
  { x: 4, y: 25, w: 15, h: 15, height: 6, label: 'Retail' },
  { x: 39, y: 4, w: 22, h: 12, height: 8, label: 'Mall' },
  { x: 39, y: 20, w: 10, h: 20, height: 10, label: 'Apt' },
  { x: 52, y: 20, w: 10, h: 12, height: 6, label: 'Cafe' },
  { x: 81, y: 4, w: 14, h: 38, height: 20, label: 'Tower' },
  { x: 4, y: 60, w: 15, h: 14, height: 2, label: 'Park' },
  { x: 4, y: 78, w: 15, h: 18, height: 8, label: 'School' },
  { x: 39, y: 60, w: 22, h: 15, height: 8, label: 'Gym' },
  { x: 39, y: 78, w: 22, h: 18, height: 10, label: 'Resi' },
  { x: 81, y: 60, w: 14, h: 36, height: 14, label: 'Hotel' },
];

// --- Poles ---

export interface PoleDef {
  poleId: string;
  wx: number;
  wy: number;
  /** The road segment this pole monitors for vehicles */
  roadSegment: {
    streetIndex: number;
    /** Range along the road's primary axis */
    start: number;
    end: number;
  };
}

export const POLES: PoleDef[] = [
  { poleId: 'POLE-01', wx: 22, wy: 12, roadSegment: { streetIndex: 0, start: 0, end: 23 } },
  { poleId: 'POLE-02', wx: 22, wy: 35, roadSegment: { streetIndex: 0, start: 23, end: 46 } },
  { poleId: 'POLE-03', wx: 22, wy: 65, roadSegment: { streetIndex: 0, start: 54, end: 77 } },
  { poleId: 'POLE-04', wx: 22, wy: 88, roadSegment: { streetIndex: 0, start: 77, end: 100 } },
  { poleId: 'POLE-05', wx: 32, wy: 12, roadSegment: { streetIndex: 0, start: 0, end: 23 } },
  { poleId: 'POLE-06', wx: 32, wy: 35, roadSegment: { streetIndex: 0, start: 23, end: 46 } },
  { poleId: 'POLE-07', wx: 32, wy: 65, roadSegment: { streetIndex: 0, start: 54, end: 77 } },
  { poleId: 'POLE-08', wx: 32, wy: 88, roadSegment: { streetIndex: 0, start: 77, end: 100 } },
  { poleId: 'POLE-09', wx: 68, wy: 12, roadSegment: { streetIndex: 1, start: 0, end: 25 } },
  { poleId: 'POLE-10', wx: 68, wy: 50, roadSegment: { streetIndex: 1, start: 25, end: 55 } },
  { poleId: 'POLE-11', wx: 78, wy: 35, roadSegment: { streetIndex: 1, start: 15, end: 45 } },
  { poleId: 'POLE-12', wx: 78, wy: 88, roadSegment: { streetIndex: 1, start: 70, end: 100 } },
];

/** Zone radius for entity spawning (world units) */
export const ZONE_RADIUS = 6;

// --- Helpers ---

/** Check if a world point is on a road */
export function isOnRoad(wx: number, wy: number): boolean {
  for (const road of ROADS) {
    const half = road.width / 2;
    if (road.axis === 'y') {
      if (wx >= road.center - half && wx <= road.center + half) return true;
    } else {
      if (wy >= road.center - half && wy <= road.center + half) return true;
    }
  }
  return false;
}

/** Check if a world point is inside any building footprint (with margin) */
export function isInsideBuilding(wx: number, wy: number, margin = 1): boolean {
  for (const b of BUILDINGS) {
    if (wx >= b.x - margin && wx <= b.x + b.w + margin &&
        wy >= b.y - margin && wy <= b.y + b.h + margin) return true;
  }
  return false;
}
