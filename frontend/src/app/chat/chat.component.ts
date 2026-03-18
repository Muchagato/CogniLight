import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  messages: ChatMessage[] = [];
  inputText = '';
  loading = false;
  suggestions: string[] = [
    'Summarize the last hour of telemetry',
    'Which poles are consuming the most energy?',
    'Any anomalies detected recently?',
    'Compare traffic between morning and evening',
  ];

  private readonly apiBase = 'http://localhost:8000/api';

  async sendMessage(text?: string): Promise<void> {
    const message = text ?? this.inputText.trim();
    if (!message || this.loading) return;

    this.inputText = '';
    this.messages.push({ role: 'user', content: message, timestamp: new Date() });
    this.scrollToBottom();

    this.loading = true;
    try {
      const resp = await fetch(`${this.apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      this.messages.push({
        role: 'assistant',
        content: data.reply,
        sources: data.sources?.length ? data.sources : undefined,
        timestamp: new Date(),
      });
    } catch (err) {
      this.messages.push({
        role: 'assistant',
        content: `Connection error: Unable to reach the AI service. Make sure the Python service is running on port 8000.`,
        timestamp: new Date(),
      });
    } finally {
      this.loading = false;
      this.scrollToBottom();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
