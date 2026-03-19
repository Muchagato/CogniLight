import { POLES, ROADS, ZONE_RADIUS, WORLD_SIZE, isOnRoad, isInsideBuilding, PoleDef } from './world-layout';

// --- Types ---

export type EntityType = 'pedestrian' | 'vehicle' | 'cyclist';

export interface ZoneEntity {
  id: number;
  type: EntityType;
  poleId: string;
  wx: number;
  wy: number;
  opacity: number;
  state: 'entering' | 'active' | 'exiting';
}

export interface PoleReadings {
  poleId: string;
  pedestrians: number;
  vehicles: number;
  cyclists: number;
}

// --- Constants ---

const FADE_IN_SPEED = 2.0;   // opacity per second
const FADE_OUT_SPEED = 3.0;

let nextEntityId = 0;

export class EntityManager {
  private entities: ZoneEntity[] = [];

  getEntities(): readonly ZoneEntity[] {
    return this.entities;
  }

  syncWithReadings(readings: PoleReadings[]): void {
    for (const reading of readings) {
      this.syncPoleType(reading.poleId, 'pedestrian', reading.pedestrians);
      this.syncPoleType(reading.poleId, 'vehicle', reading.vehicles);
      this.syncPoleType(reading.poleId, 'cyclist', reading.cyclists);
    }
  }

  private syncPoleType(poleId: string, type: EntityType, targetCount: number): void {
    const active = this.entities.filter(
      e => e.poleId === poleId && e.type === type && e.state !== 'exiting'
    );

    if (active.length < targetCount) {
      const toAdd = targetCount - active.length;
      const pole = POLES.find(p => p.poleId === poleId);
      if (!pole) return;

      for (let i = 0; i < toAdd; i++) {
        this.entities.push(this.spawnEntity(pole, type));
      }
    } else if (active.length > targetCount) {
      const toRemove = active.length - targetCount;
      for (let i = 0; i < toRemove; i++) {
        active[active.length - 1 - i].state = 'exiting';
      }
    }
  }

  private spawnEntity(pole: PoleDef, type: EntityType): ZoneEntity {
    const pos = this.findSpawnPosition(pole, type);

    return {
      id: nextEntityId++,
      type,
      poleId: pole.poleId,
      wx: pos.wx,
      wy: pos.wy,
      opacity: 0,
      state: 'entering',
    };
  }

  private findSpawnPosition(pole: PoleDef, type: EntityType): { wx: number; wy: number } {
    if (type === 'vehicle' || type === 'cyclist') {
      // Place on the road segment, clamped within zone radius of the pole
      const road = ROADS[pole.roadSegment.streetIndex];
      const seg = pole.roadSegment;
      const laneOffset = (type === 'cyclist' ? road.width / 2 - 1 : road.width / 4)
        * (Math.random() > 0.5 ? 1 : -1);

      // Clamp segment range to zone radius around the pole, and keep within world bounds
      const poleAxis = road.axis === 'y' ? pole.wy : pole.wx;
      const margin = 3; // keep vehicles away from world edges
      const minPos = Math.max(seg.start, poleAxis - ZONE_RADIUS, margin);
      const maxPos = Math.min(seg.end, poleAxis + ZONE_RADIUS, WORLD_SIZE - margin);
      const pos = minPos + Math.random() * Math.max(0, maxPos - minPos);

      if (road.axis === 'y') {
        const wx = Math.max(margin, Math.min(WORLD_SIZE - margin, road.center + laneOffset));
        return { wx, wy: pos };
      } else {
        const wy = Math.max(margin, Math.min(WORLD_SIZE - margin, road.center + laneOffset));
        return { wx: pos, wy };
      }
    }

    // Pedestrian: place near pole, avoiding roads and buildings
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (ZONE_RADIUS - 2);
      const wx = pole.wx + Math.cos(angle) * r;
      const wy = pole.wy + Math.sin(angle) * r;
      if (!isOnRoad(wx, wy) && !isInsideBuilding(wx, wy)) {
        return { wx, wy };
      }
    }
    // Fallback: on the sidewalk near the pole
    return { wx: pole.wx + (Math.random() - 0.5) * 3, wy: pole.wy + (Math.random() - 0.5) * 3 };
  }

  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];

      if (e.state === 'entering') {
        e.opacity = Math.min(1, e.opacity + FADE_IN_SPEED * clampedDt);
        if (e.opacity >= 1) {
          e.opacity = 1;
          e.state = 'active';
        }
      } else if (e.state === 'exiting') {
        e.opacity = Math.max(0, e.opacity - FADE_OUT_SPEED * clampedDt);
        if (e.opacity <= 0) {
          this.entities.splice(i, 1);
        }
      }
    }
  }
}
