import { IsoProjection } from '../iso-projection';
import { PoleRenderState } from './poles.layer';
import { RT } from '../theme';

export function drawPoleLabels(
  ctx: CanvasRenderingContext2D,
  proj: IsoProjection,
  poles: PoleRenderState[],
  selectedPoleId: string | null
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const pole of poles) {
    const pos = proj.worldToScreen(pole.wx, pole.wy);
    const isSelected = pole.poleId === selectedPoleId;

    ctx.font = `${Math.max(8, proj.scale * 1.5)}px monospace`;
    ctx.fillStyle = isSelected ? RT.labelSelected : RT.labelDefault;
    ctx.fillText(pole.poleId.replace('POLE-', 'P'), pos.sx, pos.sy - 8);
  }
}
