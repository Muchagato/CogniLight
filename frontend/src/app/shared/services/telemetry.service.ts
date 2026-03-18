import { Injectable, OnDestroy } from '@angular/core';
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

const MAX_HISTORY = 120;

@Injectable({ providedIn: 'root' })
export class TelemetryService implements OnDestroy {
  private hubConnection: signalR.HubConnection;

  private readonly readingsSubject = new BehaviorSubject<TelemetryReading[]>([]);
  private readonly simulationTimeSubject = new BehaviorSubject<string>('');
  private readonly connectionStatusSubject = new BehaviorSubject<boolean>(false);
  private readonly historySubject = new BehaviorSubject<AggregateSnapshot[]>([]);
  private readonly anomaliesSubject = new BehaviorSubject<AnomalyEvent[]>([]);

  readonly readings$ = this.readingsSubject.asObservable();
  readonly simulationTime$ = this.simulationTimeSubject.asObservable();
  readonly connected$ = this.connectionStatusSubject.asObservable();
  readonly history$ = this.historySubject.asObservable();
  readonly anomalies$ = this.anomaliesSubject.asObservable();

  private readonly destroy$ = new Subject<void>();
  private history: AggregateSnapshot[] = [];
  private anomalyLog: AnomalyEvent[] = [];

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/hubs/telemetry')
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('TelemetryUpdate', (data: TelemetryUpdate) => {
      this.readingsSubject.next(data.readings);
      this.simulationTimeSubject.next(data.simulationTime);
      this.recordSnapshot(data);
    });

    this.hubConnection.onclose(() => this.connectionStatusSubject.next(false));
    this.hubConnection.onreconnected(() => this.connectionStatusSubject.next(true));

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

  private readonly apiBase = 'http://localhost:5000/api';

  async setSpeed(multiplier: number): Promise<void> {
    await fetch(`${this.apiBase}/simulation/speed/${multiplier}`, { method: 'POST' });
  }

  async pause(): Promise<void> {
    await fetch(`${this.apiBase}/simulation/pause`, { method: 'POST' });
  }

  async resume(): Promise<void> {
    await fetch(`${this.apiBase}/simulation/resume`, { method: 'POST' });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.hubConnection.stop();
  }
}
