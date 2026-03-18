import { Component } from '@angular/core';
import { SimulationComponent } from '../simulation/simulation.component';
import { DashboardComponent } from '../dashboard/dashboard.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [SimulationComponent, DashboardComponent],
  template: `
    <div class="home-layout">
      <section class="sim-section">
        <app-simulation />
      </section>
      <section class="dash-section">
        <app-dashboard />
      </section>
    </div>
  `,
  styles: [`
    .home-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .sim-section {
      height: 45vh;
      min-height: 300px;
      border-bottom: 2px solid #334155;
    }
    .dash-section {
      flex: 1;
      overflow-y: auto;
    }
  `],
})
export class HomeComponent {}
