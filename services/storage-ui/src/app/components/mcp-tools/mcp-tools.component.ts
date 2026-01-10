import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { McpService, MCPTool, MCPToolResult } from '../../services/mcp.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mcp-tools',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mcp-tools">
      <div class="tools-header">
        <h5>🤖 MCP Tools</h5>
        <div class="connection-status">
          <span class="status-dot" [class.connected]="isConnected" [class.disconnected]="!isConnected"></span>
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </div>
      </div>

      <!-- Tool Selection -->
      <div class="tool-selector">
        <label>Select Tool:</label>
        <select class="form-control" [(ngModel)]="selectedToolName" (change)="selectTool()">
          <option value="">Choose a tool...</option>
          <option *ngFor="let tool of availableTools" [value]="tool.name">
            {{ tool.name }} - {{ tool.description }}
          </option>
        </select>
      </div>

      <!-- Tool Parameters -->
      <div class="tool-parameters" *ngIf="selectedTool">
        <h6>📋 Tool Parameters</h6>
        <div class="parameter-form">
          <div *ngFor="let param of toolParameters" class="parameter-group">
            <label [attr.for]="param.key">
              {{ param.key }}
              <span *ngIf="param.required" class="required">*</span>
            </label>
            
            <!-- String input -->
            <input 
              *ngIf="param.type === 'string'"
              type="text" 
              class="form-control" 
              [id]="param.key"
              [(ngModel)]="param.value"
              [placeholder]="param.description">
            
            <!-- Number input -->
            <input 
              *ngIf="param.type === 'number'"
              type="number" 
              class="form-control" 
              [id]="param.key"
              [(ngModel)]="param.value"
              [placeholder]="param.description">
            
            <!-- Boolean input -->
            <div *ngIf="param.type === 'boolean'" class="form-check">
              <input 
                type="checkbox" 
                class="form-check-input" 
                [id]="param.key"
                [(ngModel)]="param.value">
              <label class="form-check-label" [for]="param.key">
                {{ param.description }}
              </label>
            </div>
            
            <!-- Select input -->
            <select 
              *ngIf="param.type === 'select'"
              class="form-control" 
              [id]="param.key"
              [(ngModel)]="param.value">
              <option value="">Choose an option...</option>
              <option *ngFor="let option of param.options" [value]="option">
                {{ option }}
              </option>
            </select>
            
            <small class="form-text text-muted">{{ param.description }}</small>
          </div>
        </div>

        <div class="tool-actions">
          <button 
            class="btn btn-primary" 
            (click)="executeTool()"
            [disabled]="!canExecuteTool()">
            🔧 Execute Tool
          </button>
          <button 
            class="btn btn-outline-secondary" 
            (click)="resetParameters()">
            🔄 Reset
          </button>
        </div>
      </div>

      <!-- Tool Result -->
      <div class="tool-result" *ngIf="toolResult">
        <h6>📊 Tool Result</h6>
        <div class="result-content" [class.error]="toolResult.isError">
          <div class="result-header">
            <span class="result-status">
              {{ toolResult.isError ? '❌ Error' : '✅ Success' }}
            </span>
            <button class="btn btn-sm btn-outline-secondary" (click)="clearResult()">
              Clear
            </button>
          </div>
          
          <div class="result-body">
            <pre *ngFor="let content of toolResult.content">{{ content.text }}</pre>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <h6>⚡ Quick Actions</h6>
        <div class="action-grid">
          <button class="action-btn" (click)="quickListBuckets()">
            📦 List Buckets
          </button>
          <button class="action-btn" (click)="quickCreateBucket()">
            ➕ Create Bucket
          </button>
          <button class="action-btn" (click)="quickListObjects()">
            📄 List Objects
          </button>
          <button class="action-btn" (click)="quickSearchObjects()">
            🔍 Search Objects
          </button>
          <button class="action-btn" (click)="quickGetDownloadUrl()">
            ⬇️ Get Download URL
          </button>
          <button class="action-btn" (click)="showAIAssistant()">
            🤖 AI Assistant
          </button>
        </div>
      </div>

      <!-- AI Assistant Modal -->
      <div class="modal-overlay" *ngIf="showAIModal" (click)="showAIModal = false">
        <div class="modal-content ai-modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h6>🤖 AI Storage Assistant</h6>
            <button class="btn-close" (click)="showAIModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="chat-container">
              <div class="chat-messages">
                <div *ngFor="let message of chatMessages" class="message" [class.user]="message.isUser">
                  <div class="message-content">{{ message.text }}</div>
                  <div class="message-time">{{ message.time }}</div>
                </div>
              </div>
              
              <div class="chat-input">
                <div class="input-group">
                  <input 
                    type="text" 
                    class="form-control" 
                    [(ngModel)]="aiQuestion"
                    placeholder="Ask about your storage..."
                    (keypress.enter)="sendAIQuestion()">
                  <button class="btn btn-primary" (click)="sendAIQuestion()">
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Status -->
      <div class="connection-panel" *ngIf="!isConnected">
        <div class="alert alert-warning">
          <h6>⚠️ MCP Server Not Connected</h6>
          <p>The MCP server is not available. Please check the server configuration and try again.</p>
          <button class="btn btn-primary" (click)="reconnect()">
            🔄 Reconnect
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .mcp-tools {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .tools-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .tools-header h5 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-dot.connected {
      background-color: #10b981;
    }

    .status-dot.disconnected {
      background-color: #ef4444;
    }

    .tool-selector {
      margin-bottom: 20px;
    }

    .tool-selector label {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
      font-weight: 500;
    }

    .tool-parameters {
      margin-bottom: 20px;
      padding: 16px;
      background-color: #f9fafb;
      border-radius: 8px;
    }

    .tool-parameters h6 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .parameter-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .parameter-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .parameter-group label {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .required {
      color: #ef4444;
    }

    .tool-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .tool-result {
      margin-bottom: 20px;
    }

    .tool-result h6 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .result-content {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .result-content.error {
      border-color: #ef4444;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background-color: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .result-status {
      font-weight: 500;
    }

    .result-content.error .result-header {
      background-color: #fef2f2;
      color: #991b1b;
    }

    .result-body {
      padding: 16px;
      max-height: 300px;
      overflow-y: auto;
    }

    .result-body pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .quick-actions {
      margin-bottom: 20px;
    }

    .quick-actions h6 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
    }

    .action-btn {
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;
    }

    .action-btn:hover {
      background-color: #f9fafb;
      border-color: #3b82f6;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
    }

    .ai-modal {
      max-width: 700px;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .modal-header h6 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chat-container {
      display: flex;
      flex-direction: column;
      height: 400px;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background-color: #f9fafb;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .message {
      margin-bottom: 12px;
    }

    .message.user {
      text-align: right;
    }

    .message-content {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 80%;
      word-wrap: break-word;
    }

    .message:not(.user) .message-content {
      background-color: white;
      border: 1px solid #e5e7eb;
    }

    .message.user .message-content {
      background-color: #3b82f6;
      color: white;
    }

    .message-time {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }

    .chat-input {
      display: flex;
      gap: 8px;
    }

    .input-group {
      display: flex;
      flex: 1;
    }

    .input-group input {
      flex: 1;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .input-group button {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }

    .connection-panel {
      margin-top: 20px;
    }

    .connection-panel h6 {
      margin: 0 0 8px 0;
    }

    .connection-panel p {
      margin: 0 0 12px 0;
    }

    @media (max-width: 768px) {
      .action-grid {
        grid-template-columns: 1fr;
      }
      
      .ai-modal {
        width: 95%;
        max-height: 90vh;
      }
    }
  `]
})
export class McpToolsComponent implements OnInit, OnDestroy {
  isConnected: boolean = false;
  availableTools: MCPTool[] = [];
  selectedTool: MCPTool | null = null;
  selectedToolName: string = '';
  toolParameters: Array<{
    key: string;
    type: string;
    required: boolean;
    description: string;
    value: any;
    options?: string[];
  }> = [];
  
  toolResult: MCPToolResult | null = null;
  showAIModal: boolean = false;
  
  // AI Chat
  aiQuestion: string = '';
  chatMessages: Array<{
    text: string;
    isUser: boolean;
    time: string;
  }> = [];

  private subscriptions: Subscription[] = [];

  constructor(private mcpService: McpService) {}

  ngOnInit(): void {
    this.initializeConnection();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private initializeConnection(): void {
    // Subscribe to connection status
    const connectionSub = this.mcpService.isConnected$.subscribe(connected => {
      this.isConnected = connected;
    });

    // Subscribe to available tools
    const toolsSub = this.mcpService.availableTools$.subscribe(tools => {
      this.availableTools = tools;
    });

    this.subscriptions.push(connectionSub, toolsSub);
  }

  selectTool(): void {
    if (!this.selectedToolName) {
      this.selectedTool = null;
      this.toolParameters = [];
      return;
    }

    this.selectedTool = this.mcpService.getToolByName(this.selectedToolName) || null;
    
    if (this.selectedTool) {
      this.toolParameters = this.extractParameters(this.selectedTool);
    }
  }

  private extractParameters(tool: MCPTool): Array<{
    key: string;
    type: string;
    required: boolean;
    description: string;
    value: any;
    options?: string[];
  }> {
    const params = [];
    const properties = tool.inputSchema.properties || {};
    const required = tool.inputSchema.required || [];

    Object.entries(properties).forEach(([key, config]: [string, any]) => {
      params.push({
        key,
        type: config.type || 'string',
        required: required.includes(key),
        description: config.description || key,
        value: this.getDefaultValue(config.type),
        options: config.enum || undefined
      });
    });

    return params;
  }

  private getDefaultValue(type: string): any {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      default: return null;
    }
  }

  canExecuteTool(): boolean {
    if (!this.selectedTool) return false;
    
    return this.toolParameters.every(param => {
      if (param.required) {
        return param.value !== null && param.value !== '' && param.value !== undefined;
      }
      return true;
    });
  }

  executeTool(): void {
    if (!this.selectedTool || !this.canExecuteTool()) return;

    const arguments: Record<string, any> = {};
    this.toolParameters.forEach(param => {
      if (param.value !== null && param.value !== '' && param.value !== undefined) {
        arguments[param.key] = param.value;
      }
    });

    const sub = this.mcpService.callTool(this.selectedTool.name, arguments).subscribe({
      next: (result) => {
        this.toolResult = result;
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message || 'Unknown error'}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  resetParameters(): void {
    this.toolParameters.forEach(param => {
      param.value = this.getDefaultValue(param.type);
    });
    this.toolResult = null;
  }

  clearResult(): void {
    this.toolResult = null;
  }

  // Quick actions
  quickListBuckets(): void {
    const sub = this.mcpService.listBuckets().subscribe({
      next: (buckets) => {
        this.toolResult = {
          content: [{ type: 'text', text: JSON.stringify(buckets, null, 2) }],
          isError: false
        };
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  quickCreateBucket(): void {
    const bucketName = prompt('Enter bucket name:');
    if (!bucketName) return;

    const sub = this.mcpService.createBucket(bucketName).subscribe({
      next: (result) => {
        this.toolResult = {
          content: [{ type: 'text', text: result }],
          isError: false
        };
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  quickListObjects(): void {
    const bucketName = prompt('Enter bucket name:');
    if (!bucketName) return;

    const sub = this.mcpService.listObjects(bucketName).subscribe({
      next: (objects) => {
        this.toolResult = {
          content: [{ type: 'text', text: JSON.stringify(objects, null, 2) }],
          isError: false
        };
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  quickSearchObjects(): void {
    const bucketName = prompt('Enter bucket name:');
    const pattern = prompt('Enter search pattern:');
    if (!bucketName || !pattern) return;

    const sub = this.mcpService.searchObjects(bucketName, pattern).subscribe({
      next: (objects) => {
        this.toolResult = {
          content: [{ type: 'text', text: JSON.stringify(objects, null, 2) }],
          isError: false
        };
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  quickGetDownloadUrl(): void {
    const bucketName = prompt('Enter bucket name:');
    const objectKey = prompt('Enter object key:');
    if (!bucketName || !objectKey) return;

    const sub = this.mcpService.getDownloadUrl(bucketName, objectKey).subscribe({
      next: (url) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Download URL: ${url}` }],
          isError: false
        };
      },
      error: (error) => {
        this.toolResult = {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.subscriptions.push(sub);
  }

  showAIAssistant(): void {
    this.showAIModal = true;
    if (this.chatMessages.length === 0) {
      this.addChatMessage('Hello! I\'m your AI storage assistant. I can help you manage your storage using MCP tools. What would you like to know?', false);
    }
  }

  sendAIQuestion(): void {
    if (!this.aiQuestion.trim()) return;

    const question = this.aiQuestion;
    this.addChatMessage(question, true);
    this.aiQuestion = '';

    const sub = this.mcpService.askAIAboutStorage(question).subscribe({
      next: (response) => {
        this.addChatMessage(response, false);
      },
      error: (error) => {
        this.addChatMessage(`Sorry, I encountered an error: ${error.message}`, false);
      }
    });
    this.subscriptions.push(sub);
  }

  private addChatMessage(text: string, isUser: boolean): void {
    this.chatMessages.push({
      text,
      isUser,
      time: new Date().toLocaleTimeString()
    });
  }

  reconnect(): void {
    this.mcpService.reconnect();
  }
}
