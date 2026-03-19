import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly simCollapsed = signal(false);
  readonly chatOpen = signal(false);
  readonly chatFullscreen = signal(false);

  toggleSim(): void {
    this.simCollapsed.update(v => !v);
  }

  toggleChat(): void {
    this.chatOpen.update(v => !v);
    if (!this.chatOpen()) this.chatFullscreen.set(false);
  }

  toggleChatFullscreen(): void {
    this.chatFullscreen.update(v => !v);
  }
}
