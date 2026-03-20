import { Injectable, signal } from '@angular/core';

interface LLMConfig {
  apiKey: string;
  provider: string;
  model: string;
}

const STORAGE_KEY = 'cognilight_llm';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly _configured = signal(false);
  readonly configured = this._configured.asReadonly();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const config: LLMConfig = JSON.parse(stored);
        this._configured.set(!!config.apiKey);
      }
    } catch {
      this._configured.set(false);
    }
  }

  getConfig(): LLMConfig | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const config: LLMConfig = JSON.parse(stored);
      return config.apiKey ? config : null;
    } catch {
      return null;
    }
  }

  saveConfig(apiKey: string, provider: string, model?: string): void {
    const config: LLMConfig = { apiKey, provider, model: model || '' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    this._configured.set(true);
  }

  clearConfig(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._configured.set(false);
  }
}
