import { ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutService } from '../shared/services/layout.service';
import { AiService } from '../shared/services/ai.service';
import { MarkdownPipe } from '../shared/pipes/markdown.pipe';

interface SourceInfo {
  text: string;
  timestamp: string;
  poleIds: string[];
}

interface SqlQueryInfo {
  label: string;
  query: string;
  rowCount: number;
  columns: string[];
  rows: (string | number)[][];
  open?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceInfo[];
  sqlQueries?: SqlQueryInfo[];
  timestamp: Date;
  streaming?: boolean;
  sourcesOpen?: boolean;
  sqlOpen?: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  protected readonly layout = inject(LayoutService);
  protected readonly ai = inject(AiService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  messages: ChatMessage[] = [];
  inputText = '';
  loading = false;
  suggestions: string[] = [];

  private readonly apiBase = 'http://localhost:8000/api';

  constructor() {
    this.loadSuggestions();
  }

  private async loadSuggestions(): Promise<void> {
    try {
      const resp = await fetch(`${this.apiBase}/chat/suggestions`);
      if (resp.ok) {
        this.suggestions = await resp.json();
        this.cdr.detectChanges();
      }
    } catch { /* keep empty if service unavailable */ }
  }

  toggle(): void {
    this.layout.toggleChat();
  }

  newChat(): void {
    this.messages = [];
    this.inputText = '';
    this.loading = false;
  }

  async sendMessage(text?: string): Promise<void> {
    const message = text ?? this.inputText.trim();
    if (!message || this.loading || !this.ai.configured()) return;

    this.inputText = '';
    this.messages.push({ role: 'user', content: message, timestamp: new Date() });
    this.scrollToBottom();
    this.loading = true;

    // Create placeholder for streaming
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    this.messages.push(assistantMsg);
    this.scrollToBottom();

    try {
      const resp = await fetch(`${this.apiBase}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Normalize \r\n to \n, then split on double newlines (SSE event boundary)
        buffer = buffer.replace(/\r\n/g, '\n');
        let eventBoundary: number;
        while ((eventBoundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, eventBoundary);
          buffer = buffer.slice(eventBoundary + 2);

          let eventType = '';
          let eventData = '';

          for (const line of block.split('\n')) {
            const trimmed = line.replace(/\r$/, '');
            if (trimmed.startsWith('event:')) {
              eventType = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              eventData = trimmed.slice(5).trim();
            }
          }

          if (!eventData) continue;
          if (eventType) currentEvent = eventType;

          try {
            const data = JSON.parse(eventData);
            if (currentEvent === 'sql_context') {
              assistantMsg.sqlQueries = data.queries;
              this.detectAndScroll();
            } else if (currentEvent === 'sources') {
              assistantMsg.sources = data.sources;
              this.detectAndScroll();
            } else if (currentEvent === 'token') {
              assistantMsg.content += data.text;
              this.detectAndScroll();
            }
          } catch { /* skip malformed data */ }
        }
      }
      this.scrollToBottom();
    } catch {
      if (!assistantMsg.content) {
        assistantMsg.content = 'Connection error: Unable to reach the AI service. Make sure the Python service is running on port 8000.';
      }
      this.cdr.detectChanges();
    } finally {
      assistantMsg.streaming = false;
      this.loading = false;
      this.detectAndScroll();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private detectAndScroll(): void {
    this.cdr.detectChanges();
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
