import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatCommandService, ChatResponse, CommandResult } from '../../services/chat-command.service';
import { EnhancedChatService } from '../../services/enhanced-chat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat-interface',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-interface">
      <div class="chat-header">
        <div class="header-left">
          <h5>🤖 Storage Assistant</h5>
          <span class="status-indicator" [class.active]="!isProcessing">
            {{ isProcessing ? 'Processing...' : 'Ready' }}
          </span>
        </div>
        <div class="header-actions">
          <button class="btn btn-sm btn-outline-secondary" (click)="toggleHelp()" title="Help">
            ❓
          </button>
          <button class="btn btn-sm btn-outline-secondary" (click)="clearHistory()" title="Clear History">
            🗑️
          </button>
          <button class="btn btn-sm btn-outline-primary" (click)="toggleMinimize()" title="Minimize">
            {{ isMinimized ? '🔼' : '🔽' }}
          </button>
        </div>
      </div>

      <div class="chat-body" [class.minimized]="isMinimized" [class.help-visible]="showHelp">
        <!-- Help Panel -->
        <div class="help-panel" *ngIf="showHelp">
          <h6>📚 Available Commands</h6>
          <div class="command-categories">
            <div class="category">
              <h7>📦 Bucket Operations</h7>
              <ul>
                <li><code>Create a bucket called [name]</code></li>
                <li><code>List all buckets</code></li>
                <li><code>Delete bucket called [name]</code></li>
              </ul>
            </div>
            <div class="category">
              <h7>📄 File Operations</h7>
              <ul>
                <li><code>Show files in bucket [name]</code></li>
                <li><code>Upload file [filename] to bucket [name]</code></li>
                <li><code>Download file [filename] from bucket [name]</code></li>
                <li><code>Delete file [filename] from bucket [name]</code></li>
              </ul>
            </div>
            <div class="category">
              <h7>🔍 Search & Info</h7>
              <ul>
                <li><code>Search for [pattern] files in bucket [name]</code></li>
                <li><code>Get info about file [filename] in bucket [name]</code></li>
                <li><code>Get download URL for file [filename] in bucket [name]</code></li>
              </ul>
            </div>
          </div>
          <div class="examples">
            <h7>💡 Example Conversations</h7>
            <div class="example">
              <strong>You:</strong> "Create a bucket called my-documents"<br>
              <strong>Bot:</strong> "✅ Bucket 'my-documents' created successfully"
            </div>
            <div class="example">
              <strong>You:</strong> "Search for *.pdf files in bucket my-documents"<br>
              <strong>Bot:</strong> "🔍 Found 3 files matching '*.pdf' in bucket 'my-documents'"
            </div>
          </div>
        </div>

        <!-- Messages Container -->
        <div class="messages-container" #messagesContainer>
          <div class="welcome-message" *ngIf="messages.length === 0">
            <div class="welcome-content">
              <h6>👋 Welcome to Storage Assistant!</h6>
              <p>I can help you manage your storage using natural language commands. Try asking me to:</p>
              <ul>
                <li>Create, list, or delete buckets</li>
                <li>Upload, download, or delete files</li>
                <li>Search for files with patterns</li>
                <li>Get file information and download URLs</li>
              </ul>
              <p>Type a command below or click <strong>❓ Help</strong> to see all available commands.</p>
            </div>
          </div>

          <div *ngFor="let message of messages; trackBy: trackByMessage" class="message" [class.user]="message.isUser">
            <div class="message-content">
              <div class="message-text">{{ message.text }}</div>
              
              <!-- Command Details -->
              <div class="command-details" *ngIf="message.command">
                <div class="command-info">
                  <span class="command-intent">{{ message.command.intent }}</span>
                  <span class="command-protocol">{{ message.command.protocol }}</span>
                  <span class="command-confidence">{{ Math.round(message.command.confidence * 100) }}% confidence</span>
                </div>
                <div class="command-params" *ngIf="Object.keys(message.command.parameters).length > 0">
                  <strong>Parameters:</strong>
                  <pre>{{ JSON.stringify(message.command.parameters, null, 2) }}</pre>
                </div>
              </div>

              <!-- Execution Result -->
              <div class="execution-result" *ngIf="message.result" [class.success]="message.result.success" [class.error]="!message.result.success">
                <div class="result-header">
                  <span class="result-status">
                    {{ message.result.success ? '✅ Executed' : '❌ Failed' }}
                  </span>
                  <span class="result-details">
                    via {{ message.result.executedBy }} ({{ message.result.executionTime }}ms)
                  </span>
                </div>
                <div class="result-data" *ngIf="message.result.data">
                  <pre>{{ JSON.stringify(message.result.data, null, 2) }}</pre>
                </div>
              </div>

              <!-- Suggestions -->
              <div class="suggestions" *ngIf="message.suggestions && message.suggestions.length > 0">
                <div class="suggestions-label">💡 Suggestions:</div>
                <div class="suggestion-buttons">
                  <button 
                    *ngFor="let suggestion of message.suggestions" 
                    class="btn btn-sm btn-outline-primary suggestion-btn"
                    (click)="useSuggestion(suggestion)">
                    {{ suggestion }}
                  </button>
                </div>
              </div>
            </div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>

          <!-- Typing Indicator -->
          <div class="typing-indicator" *ngIf="isProcessing">
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="typing-text">Processing your command...</span>
          </div>
        </div>

        <!-- Input Area -->
        <div class="input-area">
          <div class="quick-actions" *ngIf="!showHelp">
            <button class="quick-btn" (click)="quickCommand('List all buckets')" title="List Buckets">
              📦 List
            </button>
            <button class="quick-btn" (click)="quickCommand('Create a bucket called my-data')" title="Create Bucket">
              ➕ Create
            </button>
            <button class="quick-btn" (click)="quickCommand('Search for *.pdf files')" title="Search Files">
              🔍 Search
            </button>
            <button class="quick-btn" (click)="quickCommand('Get download URL for file')" title="Get URL">
              🔗 Get URL
            </button>
          </div>
          
          <div class="input-group">
            <input 
              type="text" 
              class="form-control chat-input" 
              [(ngModel)]="currentMessage"
              placeholder="Ask me to manage your storage... (e.g., 'Create a bucket called my-data')"
              (keypress)="onKeyPress($event)"
              [disabled]="isProcessing">
            <button 
              class="btn btn-primary send-btn" 
              (click)="sendMessage()"
              [disabled]="!currentMessage.trim() || isProcessing">
              {{ isProcessing ? '⏳' : '📤' }}
            </button>
          </div>

          <!-- File Upload Area -->
          <div class="file-upload-area" 
               *ngIf="selectedFiles.length > 0 || dragOver"
               [class.drag-over]="dragOver"
               (dragover)="dragOver = true; $event.preventDefault()"
               (dragleave)="dragOver = false; $event.preventDefault()"
               (drop)="handleFileDrop($event)">
            
            <div class="upload-header" *ngIf="selectedFiles.length > 0">
              <h6>📎 Selected Files ({{ selectedFiles.length }})</h6>
              <button class="btn btn-sm btn-outline-secondary" (click)="clearFiles()">Clear All</button>
            </div>

            <div class="file-list" *ngIf="selectedFiles.length > 0">
              <div *ngFor="let file of selectedFiles" class="file-item">
                <div class="file-info">
                  <span class="file-name">{{ file.name }}</span>
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                </div>
                <button class="btn btn-sm btn-outline-danger" (click)="removeFile(file)">×</button>
              </div>
            </div>

            <div class="upload-prompt" *ngIf="selectedFiles.length === 0">
              <div class="upload-icon">📁</div>
              <p>Drag & drop files here or click to browse</p>
              <input 
                type="file" 
                multiple 
                (change)="handleFileSelect($event)"
                #fileInput
                style="display: none;">
              <button class="btn btn-outline-primary" (click)="fileInput.click()">
                Browse Files
              </button>
            </div>

            <div class="upload-actions" *ngIf="selectedFiles.length > 0">
              <button 
                class="btn btn-success" 
                (click)="uploadFiles()"
                [disabled]="!currentMessage.includes('bucket')">
                📤 Upload Files
              </button>
              <small class="text-muted">
                💡 Add bucket name to your message (e.g., "Upload to bucket called my-documents")
              </small>
            </div>
          </div>

          <!-- File Upload Toggle -->
          <div class="file-upload-toggle" *ngIf="selectedFiles.length === 0">
            <button class="btn btn-sm btn-outline-secondary" (click)="toggleFileUpload()">
              📎 Attach Files
            </button>
          </div>
          
          <div class="input-hint">
            💡 Try: "Create a bucket called my-documents" or click Help ❓ for more commands
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-interface {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 400px;
      height: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px 12px 0 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-left h5 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .status-indicator {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(255,255,255,0.2);
    }

    .status-indicator.active {
      background: rgba(16, 185, 129, 0.3);
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .header-actions button {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .header-actions button:hover {
      background: rgba(255,255,255,0.3);
    }

    .chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-body.minimized {
      height: 60px;
    }

    .help-panel {
      padding: 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      overflow-y: auto;
      max-height: 200px;
    }

    .help-panel h6 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .command-categories {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .category h7 {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
      color: #374151;
    }

    .category ul {
      margin: 0;
      padding-left: 16px;
    }

    .category li {
      font-size: 12px;
      margin-bottom: 2px;
    }

    .category code {
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    }

    .examples h7 {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #374151;
    }

    .example {
      background: white;
      padding: 8px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 12px;
      line-height: 1.4;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .welcome-message {
      text-align: center;
      padding: 20px;
      color: #6b7280;
    }

    .welcome-content h6 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
    }

    .welcome-content p {
      margin: 0 0 8px 0;
      font-size: 14px;
    }

    .welcome-content ul {
      text-align: left;
      margin: 8px 0;
    }

    .message {
      display: flex;
      margin-bottom: 16px;
      max-width: 100%;
    }

    .message.user {
      flex-direction: row-reverse;
    }

    .message-content {
      max-width: 85%;
      background: #f1f5f9;
      padding: 12px;
      border-radius: 12px;
      position: relative;
    }

    .message.user .message-content {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .message-text {
      font-size: 14px;
      line-height: 1.4;
      margin-bottom: 8px;
    }

    .command-details {
      background: rgba(0,0,0,0.1);
      padding: 8px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .command-info {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }

    .command-intent {
      background: rgba(255,255,255,0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .command-protocol {
      background: rgba(255,255,255,0.2);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .command-confidence {
      opacity: 0.8;
    }

    .command-params pre {
      margin: 4px 0 0 0;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .execution-result {
      padding: 8px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .execution-result.success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .execution-result.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .result-data pre {
      margin: 4px 0 0 0;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .suggestions {
      margin-top: 8px;
    }

    .suggestions-label {
      font-size: 12px;
      margin-bottom: 4px;
      opacity: 0.8;
    }

    .suggestion-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .suggestion-btn {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 12px;
    }

    .message-time {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 4px;
      align-self: flex-end;
    }

    .message.user .message-time {
      align-self: flex-start;
    }

    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      color: #6b7280;
      font-size: 14px;
    }

    .typing-dots {
      display: flex;
      gap: 2px;
    }

    .typing-dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #9ca3af;
      animation: typing 1.4s infinite ease-in-out;
    }

    .typing-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    .input-area {
      border-top: 1px solid #e2e8f0;
      padding: 12px;
    }

    .quick-actions {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }

    .quick-btn {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    .quick-btn:hover {
      background: #f1f5f9;
    }

    .input-group {
      display: flex;
      gap: 8px;
    }

    .chat-input {
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      font-size: 14px;
      padding: 8px 16px;
    }

    .chat-input:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .send-btn {
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .input-hint {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 4px;
      text-align: center;
    }

    .file-upload-area {
      margin-top: 8px;
      border: 2px dashed #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #f8fafc;
    }

    .file-upload-area.drag-over {
      border-color: #667eea;
      background: #f0f9ff;
    }

    .upload-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .upload-header h6 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }

    .file-list {
      margin-bottom: 12px;
    }

    .file-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      background: white;
      border-radius: 6px;
      margin-bottom: 4px;
      border: 1px solid #e2e8f0;
    }

    .file-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .file-name {
      font-size: 12px;
      font-weight: 500;
      word-break: break-all;
    }

    .file-size {
      font-size: 11px;
      color: #6b7280;
    }

    .upload-prompt {
      text-align: center;
      padding: 16px;
    }

    .upload-icon {
      font-size: 24px;
      margin-bottom: 8px;
    }

    .upload-prompt p {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #6b7280;
    }

    .upload-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }

    .upload-actions small {
      font-size: 11px;
      text-align: center;
    }

    .file-upload-toggle {
      text-align: center;
      margin-top: 8px;
    }

    @media (max-width: 480px) {
      .chat-interface {
        width: calc(100vw - 40px);
        right: 20px;
        left: 20px;
        height: 500px;
      }
    }
  `]
})
export class ChatInterfaceComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  currentMessage: string = '';
  messages: ChatResponse[] = [];
  isProcessing: boolean = false;
  isMinimized: boolean = false;
  showHelp: boolean = false;
  selectedFiles: File[] = [];
  dragOver: boolean = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private chatService: ChatCommandService,
    private enhancedChatService: EnhancedChatService
  ) {}

  ngOnInit(): void {
    // Subscribe to command history
    const historySub = this.chatService.commandHistory$.subscribe(history => {
      this.messages = history;
      this.scrollToBottom();
    });

    // Subscribe to processing status
    const processingSub = this.chatService.isProcessing$.subscribe(processing => {
      this.isProcessing = processing;
    });

    this.subscriptions.push(historySub, processingSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  sendMessage(): void {
    if (!this.currentMessage.trim() || this.isProcessing) return;

    const userMessage = this.currentMessage.trim();
    this.currentMessage = '';

    // Add user message to history
    const userResponse: ChatResponse = {
      text: userMessage,
      isUser: true,
      timestamp: new Date()
    };

    // Process with files if any are selected
    if (this.selectedFiles.length > 0) {
      this.enhancedChatService.processCommandWithFiles(userMessage, this.selectedFiles).subscribe();
      this.selectedFiles = []; // Clear files after processing
    } else {
      // Process regular command
      this.chatService.processCommand(userMessage).subscribe();
    }
  }

  // File upload methods
  handleFileSelect(event: any): void {
    const files = Array.from(event.target.files) as File[];
    this.selectedFiles = [...this.selectedFiles, ...files];
  }

  handleFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    
    if (event.dataTransfer?.files) {
      const files = Array.from(event.dataTransfer.files) as File[];
      this.selectedFiles = [...this.selectedFiles, ...files];
    }
  }

  removeFile(file: File): void {
    this.selectedFiles = this.selectedFiles.filter(f => f !== file);
  }

  clearFiles(): void {
    this.selectedFiles = [];
    this.dragOver = false;
  }

  uploadFiles(): void {
    if (this.selectedFiles.length === 0) return;

    const userMessage = this.currentMessage.trim() || 'Upload files';
    this.currentMessage = '';

    // Add user message to history
    const userResponse: ChatResponse = {
      text: userMessage,
      isUser: true,
      timestamp: new Date()
    };

    // Process file upload
    this.enhancedChatService.processCommandWithFiles(userMessage, this.selectedFiles).subscribe();
    this.selectedFiles = []; // Clear files after processing
  }

  toggleFileUpload(): void {
    this.dragOver = !this.dragOver;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  useSuggestion(suggestion: string): void {
    this.currentMessage = suggestion;
    this.sendMessage();
  }

  quickCommand(command: string): void {
    this.currentMessage = command;
    this.sendMessage();
  }

  clearHistory(): void {
    this.chatService.clearHistory();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  private formatTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private trackByMessage(index: number, message: ChatResponse): string {
    return `${message.timestamp.getTime()}-${message.isUser}`;
  }
}
