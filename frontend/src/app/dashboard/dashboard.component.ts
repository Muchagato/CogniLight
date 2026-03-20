import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import {
  TelemetryService,
  AggregateSnapshot,
  AnomalyEvent,
  IncidentLog,
  PoleBucket,
  TimeRangeKey,
  TIME_RANGES,
  TimeRangeConfig,
} from '../shared/services/telemetry.service';
import { TelemetryReading } from '../shared/models/telemetry.model';
import { CT, TOOLTIP_STYLE, AXIS_LABEL, AXIS_LINE, SPLIT_LINE } from '../shared/chart-theme';

/** Per-pole live snapshot for chart history */
interface PoleSnapshot {
  time: string;
  energy: number;
  ped: number;
  veh: number;
  cyc: number;
  temp: number;
  humidity: number;
  aqi: number;
  noise: number;
}

const MAX_POLE_HISTORY = 120;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  private readonly telemetry = inject(TelemetryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  readings: TelemetryReading[] = [];
  simulationTime = '';
  connected = false;
  anomalies: AnomalyEvent[] = [];
  incidentLogs: IncidentLog[] = [];
  selectedPoleId: string | null = null;

  // KPI values
  totalEnergy = 0;
  totalPedestrians = 0;
  totalVehicles = 0;
  avgAqi = 0;
  activeAnomalies = 0;

  // Time range
  readonly ranges = TIME_RANGES;
  activeRange: TimeRangeKey = 'live';
  loading = false;
  rangeLabel = '';

  get isLive(): boolean { return this.activeRange === 'live'; }

  // Dynamic chart titles
  get energyTitle(): string {
    return this.selectedPoleId ? `${this.selectedPoleId} Energy` : 'Energy Consumption';
  }
  get trafficTitle(): string {
    return this.selectedPoleId ? `${this.selectedPoleId} Traffic` : 'Traffic Density';
  }
  get envTitle(): string {
    return this.selectedPoleId ? `${this.selectedPoleId} Environment` : 'Environmental';
  }

  // ECharts instances
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private energyChart: any = null;
  private trafficChart: any = null;
  private envChart: any = null;

  readonly initOpts: EChartsOption = {};

  // Live data
  private history: AggregateSnapshot[] = [];
  private poleHistory = new Map<string, PoleSnapshot[]>();

  // Historical data
  private historicalData: AggregateSnapshot[] = [];
  private historicalPoleData: PoleBucket[] = [];
  private abortController: AbortController | null = null;

  // Rolling window refresh for historical ranges
  private refreshTickCounter = 0;
  private refreshIntervalTicks = 0;
  private refreshInFlight = false;


  // Mode tracking for notMerge
  private lastWasHistorical = false;
  private lastPoleId: string | null = null;

  // Per-pole averages for historical table
  historicalPoleAverages: Map<string, {
    energy: number; ped: number; veh: number;
    light: number; aqi: number; noise: number; anomalies: number;
  }> = new Map();

  constructor() {
    this.telemetry.readings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(r => {
        this.readings = r;
        this.recordPoleSnapshots(r);
        if (this.isLive) {
          this.updateKpis(r);
        }
        this.cdr.markForCheck();
      });

    this.telemetry.simulationTime$
      .pipe(takeUntil(this.destroy$))
      .subscribe(t => {
        this.simulationTime = t;

        // Rolling window: periodically re-fetch historical data
        if (!this.isLive && this.refreshIntervalTicks > 0 && !this.refreshInFlight) {
          this.refreshTickCounter++;
          if (this.refreshTickCounter >= this.refreshIntervalTicks) {
            this.refreshTickCounter = 0;
            this.refreshInFlight = true;
            this.refreshHistoricalWindow().finally(() => {
              this.refreshInFlight = false;
            });
          }
        }

        this.cdr.markForCheck();
      });

    this.telemetry.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => {
        this.connected = c;
        this.cdr.markForCheck();
      });

    this.telemetry.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(h => {
        this.history = h;
        if (this.isLive) {
          this.updateCharts();
        }
      });

    this.telemetry.anomalies$
      .pipe(takeUntil(this.destroy$))
      .subscribe(a => {
        if (this.isLive) {
          this.anomalies = a;
          this.cdr.markForCheck();
        }
      });

    this.telemetry.incidentLogs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(logs => {
        this.incidentLogs = logs;
        this.cdr.markForCheck();
      });

    this.telemetry.selectedPoleId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        this.selectedPoleId = id;
        if (this.isLive) {
          this.updateCharts();
        } else {
          this.fetchPoleHistory();
        }
        this.cdr.markForCheck();
      });
  }

  // --- Per-pole live history ---

  private recordPoleSnapshots(readings: TelemetryReading[]): void {
    const time = this.simulationTime;
    if (!time) return;
    for (const r of readings) {
      let snapshots = this.poleHistory.get(r.poleId);
      if (!snapshots) {
        snapshots = [];
        this.poleHistory.set(r.poleId, snapshots);
      }
      snapshots.push({
        time,
        energy: r.energyWatts,
        ped: r.pedestrianCount,
        veh: r.vehicleCount,
        cyc: r.cyclistCount,
        temp: r.temperatureC,
        humidity: r.humidityPct,
        aqi: r.airQualityAqi,
        noise: r.noiseDb,
      });
      if (snapshots.length > MAX_POLE_HISTORY) snapshots.shift();
    }
  }

  // --- Chart init ---

  onEnergyChartInit(chart: unknown): void {
    this.energyChart = chart;
    setTimeout(() => { this.energyChart?.resize(); this.updateCharts(); });
  }

  onTrafficChartInit(chart: unknown): void {
    this.trafficChart = chart;
    setTimeout(() => { this.trafficChart?.resize(); this.updateCharts(); });
  }

  onEnvChartInit(chart: unknown): void {
    this.envChart = chart;
    setTimeout(() => { this.envChart?.resize(); this.updateCharts(); });
  }


  // --- Time range ---

  async onRangeChange(key: TimeRangeKey): Promise<void> {
    if (key === this.activeRange) return;
    this.activeRange = key;

    if (key === 'live') {
      this.rangeLabel = '';
      this.historicalData = [];
      this.historicalPoleData = [];
      this.historicalPoleAverages.clear();
      this.refreshTickCounter = 0;
      this.refreshIntervalTicks = 0;
      this.refreshInFlight = false;
      this.updateKpis(this.readings);
      this.anomalies = this.telemetry['anomalyLog'] || [];
      this.incidentLogs = this.telemetry['incidentLog'] || [];
      this.updateCharts();
      this.cdr.detectChanges();
      return;
    }

    const range = TIME_RANGES.find(r => r.key === key)!;
    const now = this.simulationTime ? new Date(this.simulationTime) : new Date();
    const from = new Date(now.getTime() - range.duration * 1000);
    const fromIso = from.toISOString();
    const toIso = now.toISOString();

    this.rangeLabel = this.formatRangeLabel(from, now, range);
    this.loading = true;
    this.showChartLoading();
    this.cdr.detectChanges();

    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const [buckets, anomalies, incidents] = await Promise.all([
        this.telemetry.getHistory(fromIso, toIso, range.bucket, signal),
        this.telemetry.getAnomaliesInRange(fromIso, toIso, 200, signal),
        this.telemetry.getIncidentLogsInRange(fromIso, toIso, 50, signal),
      ]);

      if (signal.aborted) return;

      this.historicalData = buckets.map(b => ({
        time: b.bucketStart,
        totalEnergy: b.totalEnergy,
        totalPedestrians: Math.round(b.totalPedestrians),
        totalVehicles: Math.round(b.totalVehicles),
        totalCyclists: Math.round(b.totalCyclists),
        avgAqi: Math.round(b.avgAqi),
        avgTemperature: +b.avgTemperature.toFixed(1),
        avgHumidity: +b.avgHumidity.toFixed(1),
        avgNoise: +b.avgNoise.toFixed(1),
        anomalyCount: b.anomalyCount,
      }));

      this.anomalies = anomalies;
      this.incidentLogs = incidents;
      this.updateHistoricalKpis(this.historicalData);
      this.updateCharts();

      // If a pole is selected, also fetch its history for main charts
      if (this.selectedPoleId) {
        this.fetchPoleHistory();
      }
      this.fetchHistoricalPoleAverages(fromIso, toIso, range.bucket, signal);

      // Start rolling window refresh
      this.refreshTickCounter = 0;
      this.refreshIntervalTicks = this.getRefreshInterval(range);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch history:', e);
      }
    } finally {
      this.loading = false;
      this.hideChartLoading();
      this.cdr.detectChanges();
    }
  }

  private async fetchPoleHistory(): Promise<void> {
    if (this.isLive || !this.selectedPoleId) {
      this.historicalPoleData = [];
      return;
    }

    const range = TIME_RANGES.find(r => r.key === this.activeRange)!;
    const now = this.simulationTime ? new Date(this.simulationTime) : new Date();
    const from = new Date(now.getTime() - range.duration * 1000);

    try {
      this.historicalPoleData = await this.telemetry.getPoleHistory(
        this.selectedPoleId, from.toISOString(), now.toISOString(), range.bucket
      );
      this.updateCharts();
      this.cdr.detectChanges();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch pole history:', e);
      }
    }
  }

  private async fetchHistoricalPoleAverages(
    from: string, to: string, bucket: number, signal: AbortSignal
  ): Promise<void> {
    const poleIds = Array.from({ length: 12 }, (_, i) => `POLE-${String(i + 1).padStart(2, '0')}`);
    const promises = poleIds.map(id =>
      this.telemetry.getPoleHistory(id, from, to, bucket, signal)
        .then(data => ({ id, data }))
    );

    try {
      const results = await Promise.all(promises);
      if (signal.aborted) return;

      this.historicalPoleAverages.clear();
      for (const { id, data } of results) {
        if (data.length === 0) continue;
        const n = data.length;
        this.historicalPoleAverages.set(id, {
          energy: Math.round(data.reduce((s, d) => s + d.avgEnergy, 0) / n),
          ped: Math.round(data.reduce((s, d) => s + d.avgPedestrians, 0) / n),
          veh: Math.round(data.reduce((s, d) => s + d.avgVehicles, 0) / n),
          light: Math.round(data.reduce((s, d) => s + d.avgLightLevel, 0) / n),
          aqi: Math.round(data.reduce((s, d) => s + d.avgAqi, 0) / n),
          noise: Math.round(data.reduce((s, d) => s + d.avgNoise, 0) / n),
          anomalies: data.reduce((s, d) => s + d.anomalyCount, 0),
        });
      }
      this.cdr.detectChanges();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to fetch pole averages:', e);
      }
    }
  }

  // --- KPIs ---

  private updateKpis(r: TelemetryReading[]): void {
    this.totalEnergy = Math.round(r.reduce((s, x) => s + x.energyWatts, 0));
    this.totalPedestrians = r.reduce((s, x) => s + x.pedestrianCount, 0);
    this.totalVehicles = r.reduce((s, x) => s + x.vehicleCount, 0);
    this.avgAqi = r.length ? Math.round(r.reduce((s, x) => s + x.airQualityAqi, 0) / r.length) : 0;
    this.activeAnomalies = r.filter(x => x.anomalyFlag).length;
  }

  private updateHistoricalKpis(data: AggregateSnapshot[]): void {
    if (!data.length) return;
    const n = data.length;
    this.totalEnergy = Math.round(data.reduce((s, d) => s + d.totalEnergy, 0) / n);
    this.totalPedestrians = Math.round(data.reduce((s, d) => s + d.totalPedestrians, 0) / n);
    this.totalVehicles = Math.round(data.reduce((s, d) => s + d.totalVehicles, 0) / n);
    this.avgAqi = Math.round(data.reduce((s, d) => s + d.avgAqi, 0) / n);
    this.activeAnomalies = data.reduce((s, d) => s + d.anomalyCount, 0);
  }

  get filteredAnomalies(): AnomalyEvent[] {
    if (!this.selectedPoleId) return this.anomalies;
    return this.anomalies.filter(a => a.poleId === this.selectedPoleId);
  }

  get filteredIncidentLogs(): IncidentLog[] {
    if (!this.selectedPoleId) return this.incidentLogs;
    return this.incidentLogs.filter(l => l.poleId === this.selectedPoleId);
  }

  selectPole(poleId: string): void {
    const newId = this.selectedPoleId === poleId ? null : poleId;
    this.telemetry.selectPole(newId);
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toISOString().substring(11, 19);
  }

  aqiClass(aqi: number): string {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    return 'unhealthy';
  }

  getAnomalySeverity(desc: string): string {
    const lower = desc.toLowerCase();
    if (lower.includes('energy spike') || lower.includes('sensor dropout') || lower.includes('null readings')) {
      return 'critical';
    }
    return 'warning';
  }

  getIncidentCategoryClass(category: string): string {
    switch (category) {
      case 'repair': return 'cat-repair';
      case 'incident': return 'cat-incident';
      case 'inspection': return 'cat-inspection';
      case 'maintenance': return 'cat-maintenance';
      case 'scheduled': return 'cat-scheduled';
      default: return 'cat-scheduled';
    }
  }


  activeRangeLabel(): string {
    const r = TIME_RANGES.find(t => t.key === this.activeRange);
    if (!r || r.key === 'live') return '';
    const labels: Record<string, string> = {
      '5m': 'Last 5 min', '15m': 'Last 15 min', '1h': 'Last 1 hour',
      '6h': 'Last 6 hours', '1d': 'Last 24 hours', '3d': 'Last 3 days',
    };
    return labels[r.key] || '';
  }

  // --- Formatting helpers ---

  private formatRangeLabel(from: Date, to: Date, range: TimeRangeConfig): string {
    if (range.duration <= 3600) {
      return `${this.fmtTime(from)} – ${this.fmtTime(to)}`;
    }
    if (range.duration <= 86400) {
      return `${this.fmtShort(from)} – ${this.fmtShort(to)}`;
    }
    return `${this.fmtDate(from)} – ${this.fmtDate(to)}`;
  }

  private fmtTime(d: Date): string { return d.toISOString().substring(11, 19); }
  private fmtShort(d: Date): string { return d.toISOString().substring(11, 16); }
  private fmtDate(d: Date): string {
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const t = d.toISOString().substring(11, 16);
    return `${m}/${day} ${t}`;
  }

  /** Returns an ECharts axisLabel.formatter string pattern for the active time range. */
  private getTimeAxisFormat(): string {
    const range = TIME_RANGES.find(r => r.key === this.activeRange);
    if (!range || range.duration <= 3600) return '{HH}:{mm}:{ss}';
    if (range.duration <= 86400) return '{HH}:{mm}';
    return '{MM}/{dd} {HH}:{mm}';
  }

  /** Zip timestamps with values into [timestamp, value] pairs for ECharts time axis.
   *  Inserts null break points when consecutive timestamps exceed the expected interval,
   *  so ECharts doesn't draw a connecting line across data gaps. */
  private timePair(times: string[], values: number[]): [string, number | null][] {
    const range = TIME_RANGES.find(r => r.key === this.activeRange);
    // Gap threshold: 3x the bucket size (or 3s for live mode)
    const bucketMs = ((range?.bucket || 1) * 3) * 1000;
    const result: [string, number | null][] = [];
    for (let i = 0; i < times.length; i++) {
      if (i > 0) {
        const prev = new Date(times[i - 1]).getTime();
        const curr = new Date(times[i]).getTime();
        if (curr - prev > bucketMs) {
          // Insert a null point just after the last valid point to break the line
          result.push([new Date(prev + 1).toISOString(), null]);
        }
      }
      result.push([times[i], values[i]]);
    }
    return result;
  }

  // --- Charts ---

  private showChartLoading(): void {
    const opts = { color: '#f59e0b', maskColor: 'rgba(15,17,21,0.8)', textColor: '#94a3b8' };
    this.energyChart?.showLoading('default', opts);
    this.trafficChart?.showLoading('default', opts);
    this.envChart?.showLoading('default', opts);
  }

  private hideChartLoading(): void {
    this.energyChart?.hideLoading();
    this.trafficChart?.hideLoading();
    this.envChart?.hideLoading();
  }

  /**
   * Extract chart data arrays from the appropriate source based on
   * current mode (live/historical) and pole selection.
   */
  private getChartArrays(): {
    times: string[];
    energy: number[];
    ped: number[];
    veh: number[];
    cyc: number[];
    temp: number[];
    humidity: number[];
    aqi: number[];
    noise: number[];
  } | null {

    if (this.isLive) {
      // Per-pole live data
      if (this.selectedPoleId) {
        const snapshots = this.poleHistory.get(this.selectedPoleId);
        if (!snapshots || snapshots.length < 2) return null;
        return {
          times: snapshots.map(s => s.time),
          energy: snapshots.map(s => Math.round(s.energy)),
          ped: snapshots.map(s => s.ped),
          veh: snapshots.map(s => s.veh),
          cyc: snapshots.map(s => s.cyc),
          temp: snapshots.map(s => +s.temp.toFixed(1)),
          humidity: snapshots.map(s => +s.humidity.toFixed(1)),
          aqi: snapshots.map(s => Math.round(s.aqi)),
          noise: snapshots.map(s => Math.round(s.noise)),
        };
      }
      // Aggregate live data
      if (this.history.length < 2) return null;
      return {
        times: this.history.map(h => h.time),
        energy: this.history.map(h => Math.round(h.totalEnergy)),
        ped: this.history.map(h => h.totalPedestrians),
        veh: this.history.map(h => h.totalVehicles),
        cyc: this.history.map(h => h.totalCyclists),
        temp: this.history.map(h => h.avgTemperature),
        humidity: this.history.map(h => h.avgHumidity),
        aqi: this.history.map(h => h.avgAqi),
        noise: this.history.map(h => h.avgNoise),
      };
    }

    // Historical mode
    if (this.selectedPoleId && this.historicalPoleData.length >= 2) {
      return {
        times: this.historicalPoleData.map(d => d.bucketStart),
        energy: this.historicalPoleData.map(d => Math.round(d.avgEnergy)),
        ped: this.historicalPoleData.map(d => Math.round(d.avgPedestrians)),
        veh: this.historicalPoleData.map(d => Math.round(d.avgVehicles)),
        cyc: this.historicalPoleData.map(d => Math.round(d.avgCyclists)),
        temp: this.historicalPoleData.map(d => +d.avgTemperature.toFixed(1)),
        humidity: this.historicalPoleData.map(d => +d.avgHumidity.toFixed(1)),
        aqi: this.historicalPoleData.map(d => Math.round(d.avgAqi)),
        noise: this.historicalPoleData.map(d => Math.round(d.avgNoise)),
      };
    }
    if (this.historicalData.length < 2) return null;
    return {
      times: this.historicalData.map(h => h.time),
      energy: this.historicalData.map(h => Math.round(h.totalEnergy)),
      ped: this.historicalData.map(h => h.totalPedestrians),
      veh: this.historicalData.map(h => h.totalVehicles),
      cyc: this.historicalData.map(h => h.totalCyclists),
      temp: this.historicalData.map(h => h.avgTemperature),
      humidity: this.historicalData.map(h => h.avgHumidity),
      aqi: this.historicalData.map(h => h.avgAqi),
      noise: this.historicalData.map(h => h.avgNoise),
    };
  }

  private updateCharts(): void {
    const arrays = this.getChartArrays();
    if (!arrays) return;

    const isHistorical = !this.isLive;

    // Use notMerge when mode or pole selection changes to clear stale dataZoom/config
    const modeChanged = isHistorical !== this.lastWasHistorical;
    const poleChanged = this.selectedPoleId !== this.lastPoleId;
    const notMerge = modeChanged || poleChanged;
    this.lastWasHistorical = isHistorical;
    this.lastPoleId = this.selectedPoleId;

    const gridBottom = isHistorical ? 50 : 24;

    const dataZoom = isHistorical ? [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider', start: 0, end: 100,
        height: 20, bottom: 4,
        borderColor: CT.axisLine,
        fillerColor: 'rgba(34,211,238,0.1)',
        handleStyle: { color: '#22d3ee' },
        textStyle: { color: CT.axisLabel, fontSize: 9 },
        dataBackground: { lineStyle: { color: CT.axisLine }, areaStyle: { color: 'rgba(34,211,238,0.05)' } },
      },
    ] : [];

    const timeFmt = this.getTimeAxisFormat();
    const timeAxis = { type: 'time' as const, boundaryGap: false as const, axisLabel: { ...AXIS_LABEL, formatter: timeFmt }, axisLine: AXIS_LINE };
    const tp = this.timePair.bind(this);

    this.energyChart?.setOption({
      animation: isHistorical,
      animationDuration: 300,
      grid: { top: 30, right: 16, bottom: gridBottom, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      xAxis: timeAxis,
      yAxis: { type: 'value', name: 'Watts', nameTextStyle: { color: CT.axisLabel }, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
      dataZoom,
      series: [{
        type: 'line',
        data: tp(arrays.times, arrays.energy),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: CT.energy, width: 2 },
        areaStyle: { color: CT.energyArea },
      }],
    }, notMerge);

    this.trafficChart?.setOption({
      animation: isHistorical,
      animationDuration: 300,
      grid: { top: 36, right: 16, bottom: gridBottom, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      legend: { data: ['Ped', 'Veh', 'Cyc'], textStyle: { color: CT.legendText, fontSize: 10 }, top: 0 },
      xAxis: timeAxis,
      yAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
      dataZoom,
      series: [
        { name: 'Ped', type: 'line', stack: 'traffic', data: tp(arrays.times, arrays.ped), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.pedestrian }, itemStyle: { color: CT.pedestrian } },
        { name: 'Veh', type: 'line', stack: 'traffic', data: tp(arrays.times, arrays.veh), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.vehicle }, itemStyle: { color: CT.vehicle } },
        { name: 'Cyc', type: 'line', stack: 'traffic', data: tp(arrays.times, arrays.cyc), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.cyclist }, itemStyle: { color: CT.cyclist } },
      ],
    }, notMerge);

    this.envChart?.setOption({
      animation: isHistorical,
      animationDuration: 300,
      grid: { top: 36, right: 50, bottom: gridBottom, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      legend: { data: ['Temp', 'Hum', 'AQI', 'Noise'], textStyle: { color: CT.legendText, fontSize: 10 }, top: 0 },
      xAxis: timeAxis,
      yAxis: [
        { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
        { type: 'value', axisLabel: AXIS_LABEL, splitLine: { show: false } },
      ],
      dataZoom,
      series: [
        { name: 'Temp', type: 'line', data: tp(arrays.times, arrays.temp), smooth: true, symbol: 'none', lineStyle: { color: CT.temperature }, itemStyle: { color: CT.temperature } },
        { name: 'Hum', type: 'line', data: tp(arrays.times, arrays.humidity), smooth: true, symbol: 'none', lineStyle: { color: CT.humidity }, itemStyle: { color: CT.humidity } },
        { name: 'AQI', type: 'line', yAxisIndex: 1, data: tp(arrays.times, arrays.aqi), smooth: true, symbol: 'none', lineStyle: { color: CT.aqi }, itemStyle: { color: CT.aqi } },
        { name: 'Noise', type: 'line', yAxisIndex: 1, data: tp(arrays.times, arrays.noise), smooth: true, symbol: 'none', lineStyle: { color: CT.noise }, itemStyle: { color: CT.noise } },
      ],
    }, notMerge);

  }


  /** Returns how many simulation ticks to wait between rolling-window refreshes. */
  private getRefreshInterval(range: TimeRangeConfig): number {
    return Math.min(Math.max(range.bucket, 5), 120);
  }

  /** Re-fetch historical data with the current simulation time as the new window edge. */
  private async refreshHistoricalWindow(): Promise<void> {
    const range = TIME_RANGES.find(r => r.key === this.activeRange);
    if (!range || range.key === 'live') return;

    const now = this.simulationTime ? new Date(this.simulationTime) : new Date();
    const from = new Date(now.getTime() - range.duration * 1000);
    const fromIso = from.toISOString();
    const toIso = now.toISOString();

    this.rangeLabel = this.formatRangeLabel(from, now, range);

    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const [buckets, anomalies, incidents] = await Promise.all([
        this.telemetry.getHistory(fromIso, toIso, range.bucket, signal),
        this.telemetry.getAnomaliesInRange(fromIso, toIso, 200, signal),
        this.telemetry.getIncidentLogsInRange(fromIso, toIso, 50, signal),
      ]);

      if (signal.aborted) return;

      this.historicalData = buckets.map(b => ({
        time: b.bucketStart,
        totalEnergy: b.totalEnergy,
        totalPedestrians: Math.round(b.totalPedestrians),
        totalVehicles: Math.round(b.totalVehicles),
        totalCyclists: Math.round(b.totalCyclists),
        avgAqi: Math.round(b.avgAqi),
        avgTemperature: +b.avgTemperature.toFixed(1),
        avgHumidity: +b.avgHumidity.toFixed(1),
        avgNoise: +b.avgNoise.toFixed(1),
        anomalyCount: b.anomalyCount,
      }));

      this.anomalies = anomalies;
      this.incidentLogs = incidents;
      this.updateHistoricalKpis(this.historicalData);
      this.updateCharts();

      if (this.selectedPoleId) {
        this.fetchPoleHistory();
      }

      this.cdr.detectChanges();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to refresh historical window:', e);
      }
    }
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
