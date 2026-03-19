import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimulationComponent } from '../simulation/simulation.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { LayoutService } from '../shared/services/layout.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, SimulationComponent, DashboardComponent],
  template: `
    <div class="home-layout">
      <section class="sim-section" [class.collapsed]="layout.simCollapsed()">
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
      flex-direction: row;
      height: 100%;
      background: var(--cl-bg-base);
    }
    .sim-section {
      width: 45%;
      min-width: 360px;
      border-right: 1px solid var(--cl-border);
      display: flex;
      flex-direction: column;

      &.collapsed {
        width: 0;
        min-width: 0;
        border-right: none;
        overflow: hidden;

        app-simulation {
          display: none;
        }
      }
    }
    .dash-section {
      flex: 1;
      overflow-y: auto;
      min-width: 0;
      background: var(--cl-bg-base);
    }
  `],
})
export class HomeComponent {
  protected readonly layout = inject(LayoutService);
}
