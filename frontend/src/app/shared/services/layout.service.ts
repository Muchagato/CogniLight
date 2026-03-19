import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly simCollapsed = signal(false);

  toggleSim(): void {
    this.simCollapsed.update(v => !v);
  }
}
