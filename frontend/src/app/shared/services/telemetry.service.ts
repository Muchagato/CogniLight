import { Injectable, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { TelemetryReading, TelemetryUpdate } from '../models/telemetry.model';

@Injectable({ providedIn: 'root' })
export class TelemetryService implements OnDestroy {
  private hubConnection: signalR.HubConnection;

  private readonly readingsSubject = new BehaviorSubject<TelemetryReading[]>([]);
  private readonly simulationTimeSubject = new BehaviorSubject<string>('');
  private readonly connectionStatusSubject = new BehaviorSubject<boolean>(false);

  readonly readings$ = this.readingsSubject.asObservable();
  readonly simulationTime$ = this.simulationTimeSubject.asObservable();
  readonly connected$ = this.connectionStatusSubject.asObservable();

  private readonly destroy$ = new Subject<void>();

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/hubs/telemetry')
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('TelemetryUpdate', (data: TelemetryUpdate) => {
      this.readingsSubject.next(data.readings);
      this.simulationTimeSubject.next(data.simulationTime);
    });

    this.hubConnection.onclose(() => this.connectionStatusSubject.next(false));
    this.hubConnection.onreconnected(() => this.connectionStatusSubject.next(true));

    this.startConnection();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.hubConnection.stop();
  }
}
