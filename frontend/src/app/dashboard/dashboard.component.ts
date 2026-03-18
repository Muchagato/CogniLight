import { Component, inject, OnDestroy } from '@angular/core';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  private readonly telemetry = inject(TelemetryService);
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

  // Chart options
  energyChartOpts: EChartsOption = {};
  trafficChartOpts: EChartsOption = {};
  envChartOpts: EChartsOption = {};
  poleChartOpts: EChartsOption = {};

  private history: AggregateSnapshot[] = [];

  constructor() {
    this.telemetry.readings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(r => {
        this.readings = r;
        this.updateKpis(r);
      });

    this.telemetry.simulationTime$
      .pipe(takeUntil(this.destroy$))
      .subscribe(t => this.simulationTime = t);

    this.telemetry.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(c => this.connected = c);

    this.telemetry.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(h => {
        this.history = h;
        this.updateCharts();
      });

    this.telemetry.anomalies$
      .pipe(takeUntil(this.destroy$))
      .subscribe(a => this.anomalies = a);
  }

  private updateKpis(r: TelemetryReading[]): void {
    this.totalEnergy = Math.round(r.reduce((s, x) => s + x.energyWatts, 0));
    this.totalPedestrians = r.reduce((s, x) => s + x.pedestrianCount, 0);
    this.totalVehicles = r.reduce((s, x) => s + x.vehicleCount, 0);
    this.avgAqi = r.length ? Math.round(r.reduce((s, x) => s + x.airQualityAqi, 0) / r.length) : 0;
    this.activeAnomalies = r.filter(x => x.anomalyFlag).length;
  }

  selectPole(poleId: string): void {
    this.selectedPoleId = this.selectedPoleId === poleId ? null : poleId;
    this.updatePoleChart();
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toISOString().substring(11, 16);
  }

  aqiClass(aqi: number): string {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    return 'unhealthy';
  }

  private chartTheme = {
    textColor: '#94a3b8',
    gridBg: 'transparent',
    lineColors: ['#f59e0b', '#06b6d4', '#a78bfa', '#22c55e', '#ef4444'],
  };

  private updateCharts(): void {
    if (this.history.length < 2) return;
    const times = this.history.map(h => this.formatTime(h.time));

    this.energyChartOpts = {
      animation: false,
      grid: { top: 30, right: 16, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155', textStyle: { color: '#e2e8f0' } },
      xAxis: { type: 'category', data: times, axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', name: 'Watts', nameTextStyle: { color: '#64748b' }, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        type: 'line',
        data: this.history.map(h => Math.round(h.totalEnergy)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 2 },
        areaStyle: { color: 'rgba(245,158,11,0.1)' },
      }],
    };

    this.trafficChartOpts = {
      animation: false,
      grid: { top: 30, right: 16, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155', textStyle: { color: '#e2e8f0' } },
      legend: { data: ['Pedestrians', 'Vehicles', 'Cyclists'], textStyle: { color: '#94a3b8', fontSize: 10 }, top: 0 },
      xAxis: { type: 'category', data: times, axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        { name: 'Pedestrians', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalPedestrians), smooth: true, symbol: 'none', areaStyle: { opacity: 0.3 }, lineStyle: { color: '#06b6d4' }, itemStyle: { color: '#06b6d4' } },
        { name: 'Vehicles', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalVehicles), smooth: true, symbol: 'none', areaStyle: { opacity: 0.3 }, lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' } },
        { name: 'Cyclists', type: 'line', stack: 'traffic', data: this.history.map(h => h.totalCyclists), smooth: true, symbol: 'none', areaStyle: { opacity: 0.3 }, lineStyle: { color: '#a78bfa' }, itemStyle: { color: '#a78bfa' } },
      ],
    };

    this.envChartOpts = {
      animation: false,
      grid: { top: 30, right: 60, bottom: 24, left: 50 },
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155', textStyle: { color: '#e2e8f0' } },
      legend: { data: ['Temp', 'Humidity', 'AQI'], textStyle: { color: '#94a3b8', fontSize: 10 }, top: 0 },
      xAxis: { type: 'category', data: times, axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: [
        { type: 'value', name: 'Temp/Humid', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } }, nameTextStyle: { color: '#64748b' } },
        { type: 'value', name: 'AQI', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { show: false }, nameTextStyle: { color: '#64748b' } },
      ],
      series: [
        { name: 'Temp', type: 'line', data: this.history.map(h => h.avgTemperature), smooth: true, symbol: 'none', lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' } },
        { name: 'Humidity', type: 'line', data: this.history.map(h => h.avgHumidity), smooth: true, symbol: 'none', lineStyle: { color: '#3b82f6' }, itemStyle: { color: '#3b82f6' } },
        { name: 'AQI', type: 'line', yAxisIndex: 1, data: this.history.map(h => h.avgAqi), smooth: true, symbol: 'none', lineStyle: { color: '#22c55e' }, itemStyle: { color: '#22c55e' } },
      ],
    };

    this.updatePoleChart();
  }

  private updatePoleChart(): void {
    if (!this.selectedPoleId || this.history.length < 2) {
      this.poleChartOpts = {};
      return;
    }

    // For per-pole chart, use latest readings only (we don't store per-pole history in frontend)
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

    this.poleChartOpts = {
      animation: false,
      radar: {
        indicator: metrics.map(m => ({ name: m, max: m === 'Energy' ? 250 : m === 'AQI' ? 150 : 100 })),
        axisName: { color: '#94a3b8' },
        splitArea: { areaStyle: { color: ['#1e293b', '#0f172a'] } },
        splitLine: { lineStyle: { color: '#334155' } },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      series: [{
        type: 'radar',
        data: [{ value: values, name: this.selectedPoleId }],
        lineStyle: { color: '#06b6d4' },
        areaStyle: { color: 'rgba(6,182,212,0.15)' },
        itemStyle: { color: '#06b6d4' },
      }],
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
