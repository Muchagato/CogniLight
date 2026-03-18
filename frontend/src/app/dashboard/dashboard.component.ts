import { Component, inject } from '@angular/core';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { TelemetryService } from '../shared/services/telemetry.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe],
  template: `
    <div class="dashboard">
      <h2>Telemetry Dashboard</h2>
      <div class="status-bar">
        <span class="sim-time">Simulation Time: {{ (telemetry.simulationTime$ | async) || 'Waiting...' }}</span>
        <span class="connection" [class.connected]="telemetry.connected$ | async">
          {{ (telemetry.connected$ | async) ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
      <div class="readings-grid">
        @for (reading of telemetry.readings$ | async; track reading.poleId) {
          <div class="pole-card" [class.anomaly]="reading.anomalyFlag">
            <h3>{{ reading.poleId }}</h3>
            <div class="metric"><span>Energy</span><span>{{ reading.energyWatts | number:'1.0-1' }} W</span></div>
            <div class="metric"><span>Pedestrians</span><span>{{ reading.pedestrianCount }}</span></div>
            <div class="metric"><span>Vehicles</span><span>{{ reading.vehicleCount }}</span></div>
            <div class="metric"><span>Light</span><span>{{ reading.lightLevelPct | number:'1.0-0' }}%</span></div>
            <div class="metric"><span>AQI</span><span>{{ reading.airQualityAqi }}</span></div>
            @if (reading.anomalyFlag) {
              <div class="anomaly-badge">ANOMALY</div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      padding: 16px;
      color: #e2e8f0;
    }
    h2 { color: #f59e0b; margin-bottom: 12px; }
    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #1e293b;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .connection {
      color: #ef4444;
      font-weight: 600;
    }
    .connection.connected { color: #22c55e; }
    .readings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .pole-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
    }
    .pole-card.anomaly {
      border-color: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.3);
    }
    .pole-card h3 {
      color: #06b6d4;
      margin: 0 0 8px;
      font-size: 14px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 2px 0;
      color: #94a3b8;
    }
    .metric span:last-child {
      color: #e2e8f0;
      font-family: monospace;
    }
    .anomaly-badge {
      margin-top: 6px;
      padding: 2px 8px;
      background: #ef4444;
      color: white;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
    }
  `]
})
export class DashboardComponent {
  protected readonly telemetry = inject(TelemetryService);
}
