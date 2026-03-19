import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimulationComponent } from '../simulation/simulation.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { ChatComponent } from '../chat/chat.component';
import { LayoutService } from '../shared/services/layout.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, SimulationComponent, DashboardComponent, ChatComponent],
  template: `
    <div class="home-layout">
      <section class="sim-section" [class.collapsed]="layout.simCollapsed()">
        <app-simulation />
      </section>
      <div class="divider">
        <button class="divider-toggle" (click)="layout.toggleSim()" [title]="layout.simCollapsed() ? 'Show map' : 'Hide map'">
          <span class="divider-arrow" [class.collapsed]="layout.simCollapsed()">&#9666;</span>
        </button>
      </div>
      <section class="dash-section">
        <app-dashboard />
      </section>
      @if (layout.chatOpen()) {
        <section class="chat-section">
          <app-chat />
        </section>
      }
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
      display: flex;
      flex-direction: column;
      transition: width 0.3s ease, min-width 0.3s ease;

      &.collapsed {
        width: 0;
        min-width: 0;
        overflow: hidden;

        app-simulation {
          display: none;
        }
      }
    }
    .divider {
      position: relative;
      width: 1px;
      background: var(--cl-border);
      flex-shrink: 0;
    }
    .divider-toggle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 48px;
      border-radius: 4px;
      background: var(--cl-bg-raised);
      border: 1px solid var(--cl-border);
      color: var(--cl-text-faint);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      z-index: 5;
      transition: background 0.15s, color 0.15s, border-color 0.15s;

      &:hover {
        background: var(--cl-bg-hover);
        color: var(--cl-text-primary);
        border-color: var(--cl-text-faint);
      }
    }
    .divider-arrow {
      font-size: 12px;
      line-height: 1;
      transition: transform 0.3s ease;

      &.collapsed {
        transform: rotate(180deg);
      }
    }
    .dash-section {
      flex: 1;
      overflow: hidden;
      min-width: 0;
      background: var(--cl-bg-base);
    }
    .chat-section {
      width: 380px;
      min-width: 380px;
      border-left: 1px solid var(--cl-border);
      display: flex;
      flex-direction: column;
      background: var(--cl-bg-raised);
      overflow: hidden;
    }
  `],
})
export class HomeComponent {
  protected readonly layout = inject(LayoutService);
}
