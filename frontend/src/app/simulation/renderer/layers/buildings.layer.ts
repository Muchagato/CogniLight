import { IsoProjection } from '../iso-projection';
import { BUILDINGS, BuildingDef } from '../world-layout';
import { RT } from '../theme';

export interface BuildingRenderItem {
  kind: 'building';
  building: BuildingDef;
  sortKey: number;
}

export function getBuildingRenderItems(): BuildingRenderItem[] {
  return BUILDINGS.map(b => ({
    kind: 'building' as const,
    building: b,
    sortKey: b.x + b.y,
  }));
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  proj: IsoProjection,
  b: BuildingDef,
  _hour: number
): void {
  const tl = proj.worldToScreen(b.x, b.y);
  const s = proj.scale;
  const w = b.w * s;
  const h = b.h * s;

  // Building fill
  ctx.fillStyle = RT.buildingFill;
  ctx.fillRect(tl.sx, tl.sy, w, h);

  // Outline
  ctx.strokeStyle = RT.buildingStroke;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(tl.sx, tl.sy, w, h);

  // Label
  const cx = tl.sx + w / 2;
  const cy = tl.sy + h / 2;
  ctx.fillStyle = RT.buildingLabel;
  ctx.font = `${Math.max(8, s * 2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, cx, cy);
}
