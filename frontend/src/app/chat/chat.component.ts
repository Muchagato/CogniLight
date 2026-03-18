import { Component } from '@angular/core';

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `
    <div class="chat-placeholder">
      <h2>AI Chat</h2>
      <p>RAG-powered chat interface will be implemented in Phase 4.</p>
    </div>
  `,
  styles: [`
    .chat-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      background: #1e293b;
      color: #f59e0b;
      border: 1px solid #334155;
      border-radius: 8px;
      margin: 16px;
    }
    p { color: #94a3b8; margin-top: 8px; }
  `]
})
export class ChatComponent {}
