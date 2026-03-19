import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly _configured = signal(false);
  readonly configured = this._configured.asReadonly();

  private readonly apiBase = 'http://localhost:8000/api';

  constructor() {
    this.checkStatus();
  }

  private async checkStatus(): Promise<void> {
    try {
      const resp = await fetch(`${this.apiBase}/chat/status`);
      if (resp.ok) {
        const data = await resp.json();
        this._configured.set(data.configured);
      }
    } catch {
      this._configured.set(false);
    }
  }
}
