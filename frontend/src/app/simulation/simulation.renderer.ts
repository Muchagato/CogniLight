import { TelemetryReading } from '../shared/models/telemetry.model';

// --- Types ---

interface Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'pedestrian' | 'vehicle' | 'cyclist';
  pathIndex: number;
  progress: number;
  color: string;
}

interface PoleState {
  poleId: string;
  x: number;
  y: number;
  lightLevel: number;
  anomaly: boolean;
  pedestrians: number;
  vehicles: number;
  cyclists: number;
}

// --- Layout constants (normalized 0-1) ---

const ROAD_WIDTH = 0.08;
const SIDEWALK_WIDTH = 0.025;

// Two vertical streets + one horizontal crossroad
const ROADS = [
  // Left vertical street
  { x1: 0.27 - ROAD_WIDTH / 2, y1: 0, x2: 0.27 + ROAD_WIDTH / 2, y2: 1 },
  // Right vertical street
  { x1: 0.73 - ROAD_WIDTH / 2, y1: 0, x2: 0.73 + ROAD_WIDTH / 2, y2: 1 },
  // Horizontal crossroad
  { x1: 0, y1: 0.50 - ROAD_WIDTH / 2, x2: 1, y2: 0.50 + ROAD_WIDTH / 2 },
];

// Buildings (fill the blocks between roads)
const BUILDINGS = [
  // Top-left block
  { x: 0.04, y: 0.04, w: 0.15, h: 0.18, label: 'Office' },
  { x: 0.04, y: 0.25, w: 0.15, h: 0.15, label: 'Retail' },
  // Top-center block
  { x: 0.39, y: 0.04, w: 0.22, h: 0.12, label: 'Mall' },
  { x: 0.39, y: 0.20, w: 0.10, h: 0.20, label: 'Apt' },
  { x: 0.52, y: 0.20, w: 0.10, h: 0.12, label: 'Cafe' },
  // Top-right block
  { x: 0.81, y: 0.04, w: 0.14, h: 0.38, label: 'Tower' },
  // Bottom-left block
  { x: 0.04, y: 0.60, w: 0.15, h: 0.14, label: 'Park' },
  { x: 0.04, y: 0.78, w: 0.15, h: 0.18, label: 'School' },
  // Bottom-center block
  { x: 0.39, y: 0.60, w: 0.22, h: 0.15, label: 'Gym' },
  { x: 0.39, y: 0.78, w: 0.22, h: 0.18, label: 'Resi' },
  // Bottom-right block
  { x: 0.81, y: 0.60, w: 0.14, h: 0.36, label: 'Hotel' },
];

// Pole positions matching backend
const POLE_POSITIONS: { poleId: string; x: number; y: number }[] = [
  { poleId: 'POLE-01', x: 0.22, y: 0.12 },
  { poleId: 'POLE-02', x: 0.22, y: 0.35 },
  { poleId: 'POLE-03', x: 0.22, y: 0.65 },
  { poleId: 'POLE-04', x: 0.22, y: 0.88 },
  { poleId: 'POLE-05', x: 0.32, y: 0.12 },
  { poleId: 'POLE-06', x: 0.32, y: 0.35 },
  { poleId: 'POLE-07', x: 0.32, y: 0.65 },
  { poleId: 'POLE-08', x: 0.32, y: 0.88 },
  { poleId: 'POLE-09', x: 0.68, y: 0.12 },
  { poleId: 'POLE-10', x: 0.68, y: 0.50 },
  { poleId: 'POLE-11', x: 0.78, y: 0.35 },
  { poleId: 'POLE-12', x: 0.78, y: 0.88 },
];

// Movement paths for entities (normalized coordinates)
const VEHICLE_PATHS = [
  // Left street northbound
  [{ x: 0.255, y: 1.05 }, { x: 0.255, y: -0.05 }],
  // Left street southbound
  [{ x: 0.285, y: -0.05 }, { x: 0.285, y: 1.05 }],
  // Right street northbound
  [{ x: 0.715, y: 1.05 }, { x: 0.715, y: -0.05 }],
  // Right street southbound
  [{ x: 0.745, y: -0.05 }, { x: 0.745, y: 1.05 }],
  // Crossroad eastbound
  [{ x: -0.05, y: 0.485 }, { x: 1.05, y: 0.485 }],
  // Crossroad westbound
  [{ x: 1.05, y: 0.515 }, { x: -0.05, y: 0.515 }],
];

const PEDESTRIAN_PATHS = [
  // Left street west sidewalk
  [{ x: 0.225, y: 1.05 }, { x: 0.225, y: -0.05 }],
  [{ x: 0.225, y: -0.05 }, { x: 0.225, y: 1.05 }],
  // Left street east sidewalk
  [{ x: 0.315, y: -0.05 }, { x: 0.315, y: 1.05 }],
  [{ x: 0.315, y: 1.05 }, { x: 0.315, y: -0.05 }],
  // Right street west sidewalk
  [{ x: 0.685, y: 1.05 }, { x: 0.685, y: -0.05 }],
  [{ x: 0.685, y: -0.05 }, { x: 0.685, y: 1.05 }],
  // Right street east sidewalk
  [{ x: 0.775, y: -0.05 }, { x: 0.775, y: 1.05 }],
  // Crossroad sidewalks
  [{ x: -0.05, y: 0.465 }, { x: 1.05, y: 0.465 }],
  [{ x: 1.05, y: 0.535 }, { x: -0.05, y: 0.535 }],
];

const ENTITY_COLORS = {
  pedestrian: '#22d3ee',
  vehicle: '#fbbf24',
  cyclist: '#a78bfa',
};

export class SimulationRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private animFrameId = 0;
  private entities: Entity[] = [];
  private poles: PoleState[] = POLE_POSITIONS.map(p => ({
    ...p, lightLevel: 0, anomaly: false, pedestrians: 0, vehicles: 0, cyclists: 0
  }));
  private hour = 12;
  private selectedPoleId: string | null = null;

  onPoleSelected: ((poleId: string | null) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resizeHandler);
    canvas.addEventListener('click', this.clickHandler);
  }

  private resizeHandler = () => this.resize();
  private clickHandler = (e: MouseEvent) => this.handleClick(e);

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height - 40; // toolbar height
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateReadings(readings: TelemetryReading[]): void {
    for (const r of readings) {
      const pole = this.poles.find(p => p.poleId === r.poleId);
      if (pole) {
        pole.lightLevel = r.lightLevelPct;
        pole.anomaly = r.anomalyFlag;
        pole.pedestrians = r.pedestrianCount;
        pole.vehicles = r.vehicleCount;
        pole.cyclists = r.cyclistCount;
      }
    }
    this.syncEntities();
  }

  updateTime(isoTime: string): void {
    if (!isoTime) return;
    const d = new Date(isoTime);
    this.hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  }

  startLoop(): void {
    const tick = () => {
      this.update();
      this.draw();
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.resizeHandler);
    this.canvas.removeEventListener('click', this.clickHandler);
  }

  // --- Entity management ---

  private syncEntities(): void {
    const totalPed = this.poles.reduce((s, p) => s + p.pedestrians, 0);
    const totalVeh = this.poles.reduce((s, p) => s + p.vehicles, 0);
    const totalCyc = this.poles.reduce((s, p) => s + p.cyclists, 0);

    // Cap entities for performance
    const targetPed = Math.min(totalPed, 80);
    const targetVeh = Math.min(totalVeh, 40);
    const targetCyc = Math.min(totalCyc, 20);

    this.adjustEntityCount('pedestrian', targetPed, PEDESTRIAN_PATHS, 0.001);
    this.adjustEntityCount('vehicle', targetVeh, VEHICLE_PATHS, 0.003);
    this.adjustEntityCount('cyclist', targetCyc, PEDESTRIAN_PATHS, 0.002);
  }

  private adjustEntityCount(
    type: Entity['type'],
    target: number,
    paths: { x: number; y: number }[][],
    speed: number
  ): void {
    const current = this.entities.filter(e => e.type === type);
    if (current.length < target) {
      for (let i = current.length; i < target; i++) {
        const pathIdx = Math.floor(Math.random() * paths.length);
        const progress = Math.random();
        const path = paths[pathIdx];
        const x = path[0].x + (path[1].x - path[0].x) * progress;
        const y = path[0].y + (path[1].y - path[0].y) * progress;
        this.entities.push({
          x, y,
          vx: 0, vy: 0,
          type,
          pathIndex: pathIdx,
          progress,
          color: ENTITY_COLORS[type],
        });
      }
    } else if (current.length > target) {
      let toRemove = current.length - target;
      this.entities = this.entities.filter(e => {
        if (e.type === type && toRemove > 0) {
          toRemove--;
          return false;
        }
        return true;
      });
    }
  }

  // --- Update ---

  private update(): void {
    const paths: Record<string, { x: number; y: number }[][]> = {
      pedestrian: PEDESTRIAN_PATHS,
      vehicle: VEHICLE_PATHS,
      cyclist: PEDESTRIAN_PATHS,
    };
    const speeds: Record<string, number> = {
      pedestrian: 0.0008 + Math.random() * 0.0003,
      vehicle: 0.0025 + Math.random() * 0.001,
      cyclist: 0.0015 + Math.random() * 0.0005,
    };

    for (const entity of this.entities) {
      const typePaths = paths[entity.type];
      const path = typePaths[entity.pathIndex];
      entity.progress += speeds[entity.type];

      if (entity.progress >= 1) {
        entity.progress = 0;
        entity.pathIndex = Math.floor(Math.random() * typePaths.length);
      }

      const p = path;
      entity.x = p[0].x + (p[1].x - p[0].x) * entity.progress;
      entity.y = p[0].y + (p[1].y - p[0].y) * entity.progress;
    }
  }

  // --- Drawing ---

  private draw(): void {
    const { ctx, width: w, height: h } = this;
    if (w === 0 || h === 0) return;

    // Sky color based on time of day
    ctx.fillStyle = this.getSkyColor();
    ctx.fillRect(0, 0, w, h);

    // Draw layers
    this.drawRoads();
    this.drawSidewalks();
    this.drawBuildings();
    this.drawPoles();
    this.drawEntities();
    this.drawPoleLabels();
  }

  private getSkyColor(): string {
    const h = this.hour;
    if (h >= 7 && h <= 18) return '#1a2332'; // day (dark theme, so light-ish ground)
    if (h >= 20 || h <= 5) return '#0a0f1a'; // night
    // dawn/dusk transition
    if (h > 5 && h < 7) {
      const t = (h - 5) / 2;
      return this.lerpColor('#0a0f1a', '#1a2332', t);
    }
    // 18-20 dusk
    const t = (h - 18) / 2;
    return this.lerpColor('#1a2332', '#0a0f1a', t);
  }

  private drawRoads(): void {
    const { ctx, width: w, height: h } = this;
    ctx.fillStyle = '#2d3748';
    for (const road of ROADS) {
      ctx.fillRect(road.x1 * w, road.y1 * h, (road.x2 - road.x1) * w, (road.y2 - road.y1) * h);
    }

    // Road center lines (dashed)
    ctx.strokeStyle = '#f59e0b44';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 12]);
    // Left street center
    ctx.beginPath();
    ctx.moveTo(0.27 * w, 0);
    ctx.lineTo(0.27 * w, h);
    ctx.stroke();
    // Right street center
    ctx.beginPath();
    ctx.moveTo(0.73 * w, 0);
    ctx.lineTo(0.73 * w, h);
    ctx.stroke();
    // Crossroad center
    ctx.beginPath();
    ctx.moveTo(0, 0.50 * h);
    ctx.lineTo(w, 0.50 * h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawSidewalks(): void {
    const { ctx, width: w, height: h } = this;
    ctx.fillStyle = '#374151';
    const sw = SIDEWALK_WIDTH;

    // Left street sidewalks
    ctx.fillRect((0.27 - ROAD_WIDTH / 2 - sw) * w, 0, sw * w, h);
    ctx.fillRect((0.27 + ROAD_WIDTH / 2) * w, 0, sw * w, h);
    // Right street sidewalks
    ctx.fillRect((0.73 - ROAD_WIDTH / 2 - sw) * w, 0, sw * w, h);
    ctx.fillRect((0.73 + ROAD_WIDTH / 2) * w, 0, sw * w, h);
    // Crossroad sidewalks
    ctx.fillRect(0, (0.50 - ROAD_WIDTH / 2 - sw) * h, w, sw * h);
    ctx.fillRect(0, (0.50 + ROAD_WIDTH / 2) * h, w, sw * h);
  }

  private drawBuildings(): void {
    const { ctx, width: w, height: h } = this;
    for (const b of BUILDINGS) {
      // Building body
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(b.x * w, b.y * h, b.w * w, b.h * h);
      // Border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);

      // Windows (small lit rectangles at night)
      if (this.hour < 6 || this.hour > 19) {
        const windowSize = 3;
        const gap = 8;
        const bx = b.x * w;
        const by = b.y * h;
        const bw = b.w * w;
        const bh = b.h * h;
        for (let wy = by + gap; wy < by + bh - gap; wy += gap) {
          for (let wx = bx + gap; wx < bx + bw - gap; wx += gap) {
            const lit = Math.random() > 0.4;
            ctx.fillStyle = lit ? '#fbbf2433' : '#0f172a';
            ctx.fillRect(wx, wy, windowSize, windowSize);
          }
        }
      }

      // Building label
      ctx.fillStyle = '#475569';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, (b.x + b.w / 2) * w, (b.y + b.h / 2) * h + 4);
    }
  }

  private drawPoles(): void {
    const { ctx, width: w, height: h } = this;
    const isNight = this.hour < 6 || this.hour > 19;

    for (const pole of this.poles) {
      const px = pole.x * w;
      const py = pole.y * h;
      const isSelected = pole.poleId === this.selectedPoleId;

      // Sensor radius (semi-transparent circle)
      const sensorRadius = 35;
      ctx.beginPath();
      ctx.arc(px, py, sensorRadius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.04)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#06b6d466' : '#f59e0b22';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Light cone at night
      if (isNight && pole.lightLevel > 0) {
        const intensity = pole.lightLevel / 100;
        const radius = 20 + intensity * 30;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
        gradient.addColorStop(0, `rgba(245, 158, 11, ${0.15 * intensity})`);
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Pole dot
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2);
      if (pole.anomaly) {
        ctx.fillStyle = '#ef4444';
        // Anomaly pulse ring
        const pulseRadius = 8 + Math.sin(Date.now() / 200) * 4;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef444488';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2);
      }
      ctx.fillStyle = pole.anomaly ? '#ef4444' : (isSelected ? '#06b6d4' : '#f59e0b');
      ctx.fill();

      // Glow on active poles
      if (pole.lightLevel > 50 || isSelected) {
        ctx.shadowColor = isSelected ? '#06b6d4' : '#f59e0b';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  private drawPoleLabels(): void {
    const { ctx, width: w, height: h } = this;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    for (const pole of this.poles) {
      const px = pole.x * w;
      const py = pole.y * h;
      const isSelected = pole.poleId === this.selectedPoleId;

      ctx.fillStyle = isSelected ? '#06b6d4' : '#64748b';
      ctx.fillText(pole.poleId.replace('POLE-', 'P'), px, py - 8);
    }
  }

  private drawEntities(): void {
    const { ctx, width: w, height: h } = this;

    for (const e of this.entities) {
      const ex = e.x * w;
      const ey = e.y * h;

      if (ex < -10 || ex > w + 10 || ey < -10 || ey > h + 10) continue;

      ctx.fillStyle = e.color;
      if (e.type === 'pedestrian') {
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'vehicle') {
        // Direction-aware rectangle
        const path = VEHICLE_PATHS[e.pathIndex];
        const isVertical = Math.abs(path[1].x - path[0].x) < 0.01;
        if (isVertical) {
          ctx.fillRect(ex - 3, ey - 5, 6, 10);
        } else {
          ctx.fillRect(ex - 5, ey - 3, 10, 6);
        }
        // Headlights at night
        if (this.hour < 6 || this.hour > 19) {
          ctx.fillStyle = '#fef3c7';
          if (isVertical) {
            const dy = path[1].y > path[0].y ? 1 : -1;
            ctx.fillRect(ex - 2, ey + dy * 5, 1.5, 2);
            ctx.fillRect(ex + 1, ey + dy * 5, 1.5, 2);
          }
        }
      } else {
        // Cyclist — small diamond
        ctx.beginPath();
        ctx.moveTo(ex, ey - 3);
        ctx.lineTo(ex + 2, ey);
        ctx.lineTo(ex, ey + 3);
        ctx.lineTo(ex - 2, ey);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- Interaction ---

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / this.width;
    const my = (e.clientY - rect.top) / this.height;

    let closestPole: string | null = null;
    let closestDist = Infinity;

    for (const pole of this.poles) {
      const dx = pole.x - mx;
      const dy = pole.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.04 && dist < closestDist) {
        closestDist = dist;
        closestPole = pole.poleId;
      }
    }

    this.selectedPoleId = closestPole;
    this.onPoleSelected?.(closestPole);
  }

  // --- Helpers ---

  private lerpColor(a: string, b: string, t: number): string {
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
}
