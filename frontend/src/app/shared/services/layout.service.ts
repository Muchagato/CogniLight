import { Injectable, signal, computed } from '@angular/core';

export type MobileView = 'map' | 'dashboard' | 'chat';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly simCollapsed = signal(false);
  readonly chatOpen = signal(false);
  readonly chatFullscreen = signal(false);
  readonly mobileView = signal<MobileView>('map');
  readonly isMobile = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(max-width: 768px)');
      this.isMobile.set(mq.matches);
      mq.addEventListener('change', e => this.isMobile.set(e.matches));
    }
  }

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

  setMobileView(view: MobileView): void {
    this.mobileView.set(view);
    // Sync desktop state when switching views on mobile
    if (view === 'chat') {
      this.chatOpen.set(true);
    } else {
      this.chatOpen.set(false);
      this.chatFullscreen.set(false);
    }
  }
}
