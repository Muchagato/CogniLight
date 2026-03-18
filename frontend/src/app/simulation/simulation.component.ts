import { Component } from '@angular/core';

@Component({
  selector: 'app-simulation',
  standalone: true,
  template: `
    <div class="simulation-placeholder">
      <h2>Street Simulation</h2>
      <p>Canvas-based street view will be implemented in Phase 2.</p>
    </div>
  `,
  styles: [`
    .simulation-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 400px;
      background: #1e293b;
      color: #f59e0b;
      border: 1px solid #334155;
      border-radius: 8px;
      margin: 16px;
    }
    p { color: #94a3b8; margin-top: 8px; }
  `]
})
export class SimulationComponent {}
