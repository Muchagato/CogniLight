import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import {
  TelemetryService,
  AggregateSnapshot,
  AnomalyEvent,
} from '../shared/services/telemetry.service';
import { TelemetryReading } from '../shared/models/telemetry.model';
import { CT, TOOLTIP_STYLE, AXIS_LABEL, AXIS_LINE, SPLIT_LINE } from '../shared/chart-theme';

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
  selectedPoleId: string | null = null;

  // KPI values
  totalEnergy = 0;
  totalPedestrians = 0;
  totalVehicles = 0;
  avgAqi = 0;
  activeAnomalies = 0;

  // ECharts instances — we call setOption directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private energyChart: any = null;
  private trafficChart: any = null;
  private envChart: any = null;
  private poleChart: any = null;

  // Minimal init options (empty charts need at least {})
  readonly initOpts: EChartsOption = {};

  private history: AggregateSnapshot[] = [];

  constructor() {
    this.telemetry.readings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(r => {
        this.readings = r;
        this.updateKpis(r);
        this.cdr.detectChanges();
      });

    this.telemetry.simulationTime$
      .pipe(takeUntil(this.destroy$))
      .subscribe(t => {
        this.simulationTime = t;
        this.cdr.detectChanges();
      });

    this.telemetry.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => {
        this.connected = c;
        this.cdr.detectChanges();
      });

    this.telemetry.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(h => {
        this.history = h;
        this.updateCharts();
      });

    this.telemetry.anomalies$
      .pipe(takeUntil(this.destroy$))
      .subscribe(a => {
        this.anomalies = a;
        this.cdr.detectChanges();
      });

    this.telemetry.selectedPoleId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        this.selectedPoleId = id;
        this.updatePoleChart();
        this.cdr.detectChanges();
      });
  }

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

  onPoleChartInit(chart: unknown): void {
    this.poleChart = chart;
    setTimeout(() => { this.poleChart?.resize(); this.updatePoleChart(); });
  }

  private updateKpis(r: TelemetryReading[]): void {
    this.totalEnergy = Math.round(r.reduce((s, x) => s + x.energyWatts, 0));
    this.totalPedestrians = r.reduce((s, x) => s + x.pedestrianCount, 0);
    this.totalVehicles = r.reduce((s, x) => s + x.vehicleCount, 0);
    this.avgAqi = r.length ? Math.round(r.reduce((s, x) => s + x.airQualityAqi, 0) / r.length) : 0;
    this.activeAnomalies = r.filter(x => x.anomalyFlag).length;
  }

  selectPole(poleId: string): void {
    const newId = this.selectedPoleId === poleId ? null : poleId;
    this.telemetry.selectPole(newId);
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toISOString().substring(11, 19); // HH:MM:SS
  }

  aqiClass(aqi: number): string {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    return 'unhealthy';
  }

  private updateCharts(): void {
    if (this.history.length < 2) return;
    const times = this.history.map(h => this.formatTime(h.time));

    this.energyChart?.setOption({
      animation: false,
      grid: { top: 30, right: 16, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { ...AXIS_LABEL, interval: 'auto' }, axisLine: AXIS_LINE },
      yAxis: { type: 'value', name: 'Watts', nameTextStyle: { color: CT.axisLabel }, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
      series: [{
        type: 'line',
        data: this.history.map(h => Math.round(h.totalEnergy)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: CT.energy, width: 2 },
        areaStyle: { color: CT.energyArea },
      }],
    });

    this.trafficChart?.setOption({
      animation: false,
      grid: { top: 30, right: 16, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      legend: { data: ['Pedestrians', 'Vehicles', 'Cyclists'], textStyle: { color: CT.legendText, fontSize: 10 }, top: 0 },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { ...AXIS_LABEL, interval: 'auto' }, axisLine: AXIS_LINE },
      yAxis: { type: 'value', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
      series: [
        { name: 'Pedestrians', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalPedestrians), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.pedestrian }, itemStyle: { color: CT.pedestrian } },
        { name: 'Vehicles', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalVehicles), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.vehicle }, itemStyle: { color: CT.vehicle } },
        { name: 'Cyclists', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalCyclists), smooth: true, symbol: 'none', areaStyle: { opacity: 0.15 }, lineStyle: { color: CT.cyclist }, itemStyle: { color: CT.cyclist } },
      ],
    });

    this.envChart?.setOption({
      animation: false,
      grid: { top: 30, right: 60, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      legend: { data: ['Temp', 'Humidity', 'AQI'], textStyle: { color: CT.legendText, fontSize: 10 }, top: 0 },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { ...AXIS_LABEL, interval: 'auto' }, axisLine: AXIS_LINE },
      yAxis: [
        { type: 'value', name: 'Temp/Humid', axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE, nameTextStyle: { color: CT.axisLabel } },
        { type: 'value', name: 'AQI', axisLabel: AXIS_LABEL, splitLine: { show: false }, nameTextStyle: { color: CT.axisLabel } },
      ],
      series: [
        { name: 'Temp', type: 'line', data: this.history.map(h => h.avgTemperature), smooth: true, symbol: 'none', lineStyle: { color: CT.temperature }, itemStyle: { color: CT.temperature } },
        { name: 'Humidity', type: 'line', data: this.history.map(h => h.avgHumidity), smooth: true, symbol: 'none', lineStyle: { color: CT.humidity }, itemStyle: { color: CT.humidity } },
        { name: 'AQI', type: 'line', yAxisIndex: 1, data: this.history.map(h => h.avgAqi), smooth: true, symbol: 'none', lineStyle: { color: CT.aqi }, itemStyle: { color: CT.aqi } },
      ],
    });

    this.updatePoleChart();
  }

  private updatePoleChart(): void {
    if (!this.selectedPoleId || this.history.length < 2) return;

    const pole = this.readings.find(r => r.poleId === this.selectedPoleId);
    if (!pole) return;

    const metrics = ['Energy', 'Light%', 'AQI', 'Noise', 'Temp'];
    const values = [
      pole.energyWatts,
      pole.lightLevelPct,
      pole.airQualityAqi,
      pole.noiseDb,
      pole.temperatureC,
    ];

    this.poleChart?.setOption({
      animation: false,
      radar: {
        indicator: metrics.map(m => ({ name: m, max: m === 'Energy' ? 250 : m === 'AQI' ? 150 : 100 })),
        axisName: { color: CT.radarAxisName },
        splitArea: { areaStyle: { color: [CT.radarSplitArea1, CT.radarSplitArea2] } },
        splitLine: { lineStyle: { color: CT.axisLine } },
        axisLine: { lineStyle: { color: CT.axisLine } },
      },
      series: [{
        type: 'radar',
        data: [{ value: values, name: this.selectedPoleId }],
        lineStyle: { color: CT.pedestrian },
        areaStyle: { color: CT.pedestrianArea },
        itemStyle: { color: CT.pedestrian },
      }],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
