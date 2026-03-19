import { IsoProjection } from '../iso-projection';
import { TelemetryReading } from '../../../shared/models/telemetry.model';
import { POLES, ZONE_RADIUS } from '../world-layout';
import { RT } from '../theme';

export interface PoleRenderState {
  poleId: string;
  wx: number;
  wy: number;
  lightLevel: number;
  anomaly: boolean;
}

export function initPoleStates(): PoleRenderState[] {
  return POLES.map(p => ({
    poleId: p.poleId,
    wx: p.wx,
    wy: p.wy,
    lightLevel: 0,
    anomaly: false,
  }));
}

export function updatePoleStates(poles: PoleRenderState[], readings: TelemetryReading[]): void {
  for (const r of readings) {
    const pole = poles.find(p => p.poleId === r.poleId);
    if (pole) {
      pole.lightLevel = r.lightLevelPct;
      pole.anomaly = r.anomalyFlag;
    }
  }
}

export function drawPole(
  ctx: CanvasRenderingContext2D,
  proj: IsoProjection,
  pole: PoleRenderState,
  selectedPoleId: string | null,
  hour: number
): void {
  const pos = proj.worldToScreen(pole.wx, pole.wy);
  const isSelected = pole.poleId === selectedPoleId;
  const isNight = hour < 6 || hour > 19;
  const scale = proj.scale;
  const [gr, gg, gb] = RT.poleGlowColor;

  // Night glow on ground
  if (isNight && pole.lightLevel > 0) {
    const intensity = pole.lightLevel / 100;
    const glowRadius = Math.max(15, scale * 5) * (0.5 + intensity * 0.5);

    const gradient = ctx.createRadialGradient(
      pos.sx, pos.sy, 0,
      pos.sx, pos.sy, glowRadius
    );
    gradient.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${0.12 * intensity})`);
    gradient.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
    ctx.beginPath();
    ctx.arc(pos.sx, pos.sy, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Pole dot
  const lampRadius = isSelected ? 5 : 3.5;

  if (pole.anomaly) {
    // Pulsing ring for anomaly
    const pulseRadius = lampRadius + 3 + Math.sin(Date.now() / 200) * 2;
    ctx.beginPath();
    ctx.arc(pos.sx, pos.sy, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = RT.poleAnomalyRing;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(pos.sx, pos.sy, lampRadius, 0, Math.PI * 2);
  ctx.fillStyle = pole.anomaly ? RT.poleAnomaly : (isSelected ? RT.poleSelected : RT.poleDefault);
  ctx.fill();

  // Glow around lamp at night
  if (isNight && pole.lightLevel > 30) {
    ctx.shadowColor = isSelected ? RT.poleSelected : RT.poleDefault;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(pos.sx, pos.sy, lampRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Sensor range circle
  const sensorRadius = ZONE_RADIUS * scale;
  ctx.strokeStyle = isSelected ? RT.poleSensorSelected : RT.poleSensorDefault;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(pos.sx, pos.sy, sensorRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Selection ring (highlighted)
  if (isSelected) {
    ctx.strokeStyle = RT.poleSelectionRing;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.sx, pos.sy, sensorRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
