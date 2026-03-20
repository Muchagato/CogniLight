import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { TelemetryReading, TelemetryUpdate } from '../models/telemetry.model';

export interface AggregateSnapshot {
  time: string;
  totalEnergy: number;
  totalPedestrians: number;
  totalVehicles: number;
  totalCyclists: number;
  avgAqi: number;
  avgTemperature: number;
  avgHumidity: number;
  avgNoise: number;
  anomalyCount: number;
}

export interface AnomalyEvent {
  time: string;
  poleId: string;
  description: string;
}

export interface IncidentLog {
  id: number;
  timestamp: string;
  poleId: string;
  author: string;
  category: string;
  text: string;
}

export interface HistoryBucket {
  bucketStart: string;
  totalEnergy: number;
  totalPedestrians: number;
  totalVehicles: number;
  totalCyclists: number;
  avgTemperature: number;
  avgHumidity: number;
  avgAqi: number;
  avgNoise: number;
  anomalyCount: number;
}

export interface PoleBucket {
  bucketStart: string;
  avgEnergy: number;
  avgPedestrians: number;
  avgVehicles: number;
  avgCyclists: number;
  avgAqi: number;
  avgNoise: number;
  avgTemperature: number;
  avgHumidity: number;
  avgLightLevel: number;
  anomalyCount: number;
}

export type TimeRangeKey = 'live' | '5m' | '15m' | '1h' | '6h' | '1d' | '3d';

export interface TimeRangeConfig {
  key: TimeRangeKey;
  label: string;
  duration: number;   // seconds, 0 for live
  bucket: number;     // bucket size in seconds, 0 for live
}

export const TIME_RANGES: TimeRangeConfig[] = [
  { key: 'live', label: 'LIVE', duration: 0,      bucket: 0 },
  { key: '5m',   label: '5m',   duration: 300,    bucket: 1 },
  { key: '15m',  label: '15m',  duration: 900,    bucket: 5 },
  { key: '1h',   label: '1h',   duration: 3600,   bucket: 10 },
  { key: '6h',   label: '6h',   duration: 21600,  bucket: 60 },
  { key: '1d',   label: '1d',   duration: 86400,  bucket: 300 },
  { key: '3d',   label: '3d',   duration: 259200, bucket: 900 },
];

const MAX_HISTORY = 120;

@Injectable({ providedIn: 'root' })
export class TelemetryService implements OnDestroy {
  private readonly zone = inject(NgZone);
  private hubConnection: signalR.HubConnection;

  private readonly readingsSubject = new BehaviorSubject<TelemetryReading[]>([]);
  private readonly simulationTimeSubject = new BehaviorSubject<string>('');
  private readonly connectionStatusSubject = new BehaviorSubject<boolean>(false);
  private readonly historySubject = new BehaviorSubject<AggregateSnapshot[]>([]);
  private readonly anomaliesSubject = new BehaviorSubject<AnomalyEvent[]>([]);
  private readonly incidentLogsSubject = new BehaviorSubject<IncidentLog[]>([]);

  readonly readings$ = this.readingsSubject.asObservable();
  readonly simulationTime$ = this.simulationTimeSubject.asObservable();
  readonly connected$ = this.connectionStatusSubject.asObservable();
  readonly history$ = this.historySubject.asObservable();
  readonly anomalies$ = this.anomaliesSubject.asObservable();
  readonly incidentLogs$ = this.incidentLogsSubject.asObservable();

  private readonly selectedPoleSubject = new BehaviorSubject<string | null>(null);
  readonly selectedPoleId$ = this.selectedPoleSubject.asObservable();

  private readonly destroy$ = new Subject<void>();
  private history: AggregateSnapshot[] = [];
  private anomalyLog: AnomalyEvent[] = [];
  private incidentLog: IncidentLog[] = [];

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/hubs/telemetry')
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('TelemetryUpdate', (data: TelemetryUpdate) => {
      this.zone.run(() => {
        this.readingsSubject.next(data.readings);
        this.simulationTimeSubject.next(data.simulationTime);
        this.recordSnapshot(data);
      });
    });

    this.hubConnection.on('IncidentLog', (log: IncidentLog) => {
      this.zone.run(() => {
        this.incidentLog = [log, ...this.incidentLog].slice(0, 50);
        this.incidentLogsSubject.next(this.incidentLog);
      });
    });

    this.hubConnection.onclose(() => this.zone.run(() => this.connectionStatusSubject.next(false)));
    this.hubConnection.onreconnected(() => this.zone.run(() => this.connectionStatusSubject.next(true)));

    this.startConnection();
  }

  private recordSnapshot(data: TelemetryUpdate): void {
    const r = data.readings;
    if (!r.length) return;

    const snap: AggregateSnapshot = {
      time: data.simulationTime,
      totalEnergy: r.reduce((s, x) => s + x.energyWatts, 0),
      totalPedestrians: r.reduce((s, x) => s + x.pedestrianCount, 0),
      totalVehicles: r.reduce((s, x) => s + x.vehicleCount, 0),
      totalCyclists: r.reduce((s, x) => s + x.cyclistCount, 0),
      avgAqi: Math.round(r.reduce((s, x) => s + x.airQualityAqi, 0) / r.length),
      avgTemperature: +(r.reduce((s, x) => s + x.temperatureC, 0) / r.length).toFixed(1),
      avgHumidity: +(r.reduce((s, x) => s + x.humidityPct, 0) / r.length).toFixed(1),
      avgNoise: +(r.reduce((s, x) => s + x.noiseDb, 0) / r.length).toFixed(1),
      anomalyCount: r.filter(x => x.anomalyFlag).length,
    };

    this.history = [...this.history.slice(-(MAX_HISTORY - 1)), snap];
    this.historySubject.next(this.history);

    // Track anomalies
    for (const reading of r) {
      if (reading.anomalyFlag && reading.anomalyDescription) {
        this.anomalyLog = [
          { time: data.simulationTime, poleId: reading.poleId, description: reading.anomalyDescription },
          ...this.anomalyLog.slice(0, 49),
        ];
      }
    }
    this.anomaliesSubject.next(this.anomalyLog);
  }

  private async startConnection(): Promise<void> {
    try {
      await this.hubConnection.start();
      this.connectionStatusSubject.next(true);
    } catch (err) {
      console.error('SignalR connection error:', err);
      setTimeout(() => this.startConnection(), 5000);
    }
  }

  selectPole(poleId: string | null): void {
    this.selectedPoleSubject.next(poleId);
  }

  private readonly apiBase = 'http://localhost:5000/api';

  async getHistory(from: string, to: string, bucketSeconds: number, signal?: AbortSignal): Promise<HistoryBucket[]> {
    const params = new URLSearchParams({ from, to, bucketSeconds: String(bucketSeconds) });
    const resp = await fetch(`${this.apiBase}/telemetry/history?${params}`, { signal });
    return resp.json();
  }

  async getPoleHistory(poleId: string, from: string, to: string, bucketSeconds: number, signal?: AbortSignal): Promise<PoleBucket[]> {
    const params = new URLSearchParams({ from, to, bucketSeconds: String(bucketSeconds) });
    const resp = await fetch(`${this.apiBase}/telemetry/history/${poleId}?${params}`, { signal });
    return resp.json();
  }

  async getAnomaliesInRange(from: string, to: string, limit = 200, signal?: AbortSignal): Promise<AnomalyEvent[]> {
    const params = new URLSearchParams({ from, to, limit: String(limit) });
    const resp = await fetch(`${this.apiBase}/telemetry/anomalies/range?${params}`, { signal });
    return resp.json();
  }

  async getIncidentLogs(limit = 20, signal?: AbortSignal): Promise<IncidentLog[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const resp = await fetch(`${this.apiBase}/incidents?${params}`, { signal });
    return resp.json();
  }

  async getIncidentLogsInRange(from: string, to: string, limit = 50, signal?: AbortSignal): Promise<IncidentLog[]> {
    const params = new URLSearchParams({ from, to, limit: String(limit) });
    const resp = await fetch(`${this.apiBase}/incidents?${params}`, { signal });
    return resp.json();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.hubConnection.stop();
  }
}
