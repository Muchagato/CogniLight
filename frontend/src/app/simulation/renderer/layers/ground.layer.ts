import { IsoProjection } from '../iso-projection';
import { ROADS, SIDEWALK_WIDTH, WORLD_SIZE, RoadDef } from '../world-layout';
import { RT } from '../theme';

export class GroundLayer {
  draw(ctx: CanvasRenderingContext2D, proj: IsoProjection): void {
    this.drawGroundPlane(ctx, proj);
    this.drawSidewalks(ctx, proj);
    this.drawRoads(ctx, proj);
    this.drawLaneMarkings(ctx, proj);
  }

  private drawGroundPlane(ctx: CanvasRenderingContext2D, proj: IsoProjection): void {
    const tl = proj.worldToScreen(0, 0);
    const br = proj.worldToScreen(WORLD_SIZE, WORLD_SIZE);
    ctx.fillStyle = RT.ground;
    ctx.fillRect(tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
  }

  private drawSidewalks(ctx: CanvasRenderingContext2D, proj: IsoProjection): void {
    ctx.fillStyle = RT.sidewalk;
    for (const road of ROADS) {
      const sw = SIDEWALK_WIDTH;
      const half = road.width / 2;

      if (road.axis === 'y') {
        this.fillRect(ctx, proj, road.center - half - sw, 0, sw, WORLD_SIZE);
        this.fillRect(ctx, proj, road.center + half, 0, sw, WORLD_SIZE);
      } else {
        this.fillRect(ctx, proj, 0, road.center - half - sw, WORLD_SIZE, sw);
        this.fillRect(ctx, proj, 0, road.center + half, WORLD_SIZE, sw);
      }
    }
  }

  private drawRoads(ctx: CanvasRenderingContext2D, proj: IsoProjection): void {
    ctx.fillStyle = RT.road;
    for (const road of ROADS) {
      const half = road.width / 2;
      if (road.axis === 'y') {
        this.fillRect(ctx, proj, road.center - half, 0, road.width, WORLD_SIZE);
      } else {
        this.fillRect(ctx, proj, 0, road.center - half, WORLD_SIZE, road.width);
      }
    }
  }

  private drawLaneMarkings(ctx: CanvasRenderingContext2D, proj: IsoProjection): void {
    ctx.strokeStyle = RT.laneMarking;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);

    for (const road of ROADS) {
      this.drawCenterLine(ctx, proj, road);
    }

    ctx.setLineDash([]);
  }

  private drawCenterLine(ctx: CanvasRenderingContext2D, proj: IsoProjection, road: RoadDef): void {
    if (road.axis === 'y') {
      const p1 = proj.worldToScreen(road.center, 0);
      const p2 = proj.worldToScreen(road.center, WORLD_SIZE);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    } else {
      const p1 = proj.worldToScreen(0, road.center);
      const p2 = proj.worldToScreen(WORLD_SIZE, road.center);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
  }

  private fillRect(
    ctx: CanvasRenderingContext2D,
    proj: IsoProjection,
    x: number, y: number, w: number, h: number
  ): void {
    const tl = proj.worldToScreen(x, y);
    const s = proj.scale;
    ctx.fillRect(tl.sx, tl.sy, w * s, h * s);
  }
}
