import { IsoProjection } from '../iso-projection';
import { ZoneEntity, EntityType } from '../entity-manager';
import { ROADS } from '../world-layout';
import { RT } from '../theme';

const COLORS: Record<EntityType, string> = {
  pedestrian: RT.pedestrian,
  vehicle: RT.vehicle,
  cyclist: RT.cyclist,
};

export function drawEntity(
  ctx: CanvasRenderingContext2D,
  proj: IsoProjection,
  e: ZoneEntity,
  hour: number
): void {
  const pos = proj.worldToScreen(e.wx, e.wy);
  const scale = proj.scale;
  const alpha = e.opacity;

  ctx.globalAlpha = alpha;

  if (e.type === 'pedestrian') {
    drawPedestrian(ctx, pos.sx, pos.sy, scale);
  } else if (e.type === 'vehicle') {
    drawVehicle(ctx, e, pos.sx, pos.sy, scale, hour);
  } else {
    drawCyclist(ctx, pos.sx, pos.sy, scale);
  }

  ctx.globalAlpha = 1;
}

function drawPedestrian(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, scale: number
): void {
  const r = Math.max(1.5, scale * 0.5);
  ctx.fillStyle = COLORS.pedestrian;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  e: ZoneEntity,
  sx: number, sy: number,
  scale: number,
  hour: number
): void {
  const road = ROADS[closestRoadIndex(e.wx, e.wy)];
  const len = Math.max(3, scale * 1.2);
  const wid = Math.max(1.5, scale * 0.6);

  ctx.fillStyle = COLORS.vehicle;

  if (road && road.axis === 'y') {
    ctx.fillRect(sx - wid, sy - len, wid * 2, len * 2);
  } else {
    ctx.fillRect(sx - len, sy - wid, len * 2, wid * 2);
  }

  // Headlights at night
  if (hour < 6 || hour > 19) {
    ctx.fillStyle = RT.headlight;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, scale * 0.25), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCyclist(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, scale: number
): void {
  const r = Math.max(1.5, scale * 0.4);
  ctx.fillStyle = COLORS.cyclist;
  ctx.beginPath();
  ctx.moveTo(sx, sy - r);
  ctx.lineTo(sx + r * 0.7, sy);
  ctx.lineTo(sx, sy + r);
  ctx.lineTo(sx - r * 0.7, sy);
  ctx.closePath();
  ctx.fill();
}

function closestRoadIndex(wx: number, wy: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ROADS.length; i++) {
    const road = ROADS[i];
    const d = road.axis === 'y'
      ? Math.abs(wx - road.center)
      : Math.abs(wy - road.center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
