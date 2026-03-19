import { TelemetryReading } from '../shared/models/telemetry.model';
import { IsoProjection } from './renderer/iso-projection';
import { WORLD_SIZE, POLES } from './renderer/world-layout';
import { EntityManager, PoleReadings } from './renderer/entity-manager';
import { GroundLayer } from './renderer/layers/ground.layer';
import {
  getBuildingRenderItems, drawBuilding, BuildingRenderItem
} from './renderer/layers/buildings.layer';
import { drawEntity } from './renderer/layers/entities.layer';
import {
  PoleRenderState,
  initPoleStates, updatePoleStates, drawPole
} from './renderer/layers/poles.layer';
import { drawPoleLabels } from './renderer/layers/overlays.layer';
import { RT } from './renderer/theme';

export class SimulationRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private animFrameId = 0;

  private readonly proj = new IsoProjection();
  private readonly entityManager = new EntityManager();
  private readonly groundLayer = new GroundLayer();
  private readonly poles: PoleRenderState[] = initPoleStates();
  private readonly buildingItems: BuildingRenderItem[] = getBuildingRenderItems();

  private hour = 12;
  private selectedPoleId: string | null = null;
  private _paused = false;
  private lastFrameTime = 0;

  /** Per-pole readings for entity sync (capped for visual clarity) */
  private poleReadings: PoleReadings[] = POLES.map(p => ({
    poleId: p.poleId, pedestrians: 0, vehicles: 0, cyclists: 0
  }));

  onPoleSelected: ((poleId: string | null) => void) | null = null;

  private resizeObserver: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resizeHandler);
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('mousemove', this.mouseMoveHandler);

    // Watch for parent container size changes (e.g. sidebar collapse/expand)
    this.resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }
  }

  // --- Public API (unchanged) ---

  setSelectedPole(poleId: string | null): void {
    this.selectedPoleId = poleId;
  }

  setPaused(paused: boolean): void {
    this._paused = paused;
  }

  updateReadings(readings: TelemetryReading[]): void {
    updatePoleStates(this.poles, readings);

    // Update per-pole entity targets (cap per pole for visual clarity)
    for (const r of readings) {
      const pr = this.poleReadings.find(p => p.poleId === r.poleId);
      if (pr) {
        pr.pedestrians = Math.min(r.pedestrianCount, 8);
        pr.vehicles = Math.min(r.vehicleCount, 5);
        pr.cyclists = Math.min(r.cyclistCount, 3);
      }
    }

    this.entityManager.syncWithReadings(this.poleReadings);
  }

  updateTime(isoTime: string): void {
    if (!isoTime) return;
    const d = new Date(isoTime);
    this.hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  }

  startLoop(): void {
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      this.update(dt);
      this.draw();
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.resizeHandler);
    this.canvas.removeEventListener('click', this.clickHandler);
    this.canvas.removeEventListener('mousemove', this.mouseMoveHandler);
    this.resizeObserver?.disconnect();
  }

  // --- Internal ---

  private resizeHandler = () => this.resize();
  private clickHandler = (e: MouseEvent) => this.handleClick(e);
  private mouseMoveHandler = (e: MouseEvent) => this.handleMouseMove(e);

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height - 40; // toolbar offset
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.proj.resize(this.width, this.height, WORLD_SIZE);
  }

  private update(dt: number): void {
    if (this._paused) return;
    this.entityManager.update(dt);
  }

  private draw(): void {
    const { ctx, width: w, height: h } = this;
    if (w === 0 || h === 0) return;

    // Sky
    ctx.fillStyle = this.getSkyColor();
    ctx.fillRect(0, 0, w, h);

    // Ground plane, roads, sidewalks
    this.groundLayer.draw(ctx, this.proj);

    // Buildings
    for (const item of this.buildingItems) {
      drawBuilding(ctx, this.proj, item.building, this.hour);
    }

    // Entities
    for (const e of this.entityManager.getEntities()) {
      drawEntity(ctx, this.proj, e, this.hour);
    }

    // Poles
    for (const pole of this.poles) {
      drawPole(ctx, this.proj, pole, this.selectedPoleId, this.hour);
    }

    // Labels on top
    drawPoleLabels(ctx, this.proj, this.poles, this.selectedPoleId);
  }

  private getSkyColor(): string {
    const h = this.hour;
    if (h >= 7 && h <= 18) return RT.skyDay;
    if (h >= 20 || h <= 5) return RT.skyNight;
    if (h > 5 && h < 7) {
      const t = (h - 5) / 2;
      return lerpColor(RT.skyNight, RT.skyDay, t);
    }
    const t = (h - 18) / 2;
    return lerpColor(RT.skyDay, RT.skyNight, t);
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = this.proj.screenToWorld(sx, sy);

    let overPole = false;
    for (const pole of this.poles) {
      const dx = pole.wx - wx;
      const dy = pole.wy - wy;
      if (dx * dx + dy * dy < 64) { // 8^2 world-unit radius
        overPole = true;
        break;
      }
    }
    this.canvas.style.cursor = overPole ? 'pointer' : 'default';
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { wx, wy } = this.proj.screenToWorld(sx, sy);

    let closestPole: string | null = null;
    let closestDist = 8; // world-unit click radius

    for (const pole of this.poles) {
      const dx = pole.wx - wx;
      const dy = pole.wy - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestPole = pole.poleId;
      }
    }

    this.selectedPoleId = closestPole;
    this.onPoleSelected?.(closestPole);
  }
}

// --- Helpers ---

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
