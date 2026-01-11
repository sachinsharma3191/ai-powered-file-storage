import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type Protocol = 'rest' | 's3' | 'mcp' | 'websocket';

export interface ProtocolConfig {
  id: Protocol;
  name: string;
  description: string;
  icon: string;
  features: string[];
  connected: boolean;
  status: 'connected' | 'disconnected' | 'error';
}

@Component({
  selector: 'app-protocol-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="protocol-selector">
      <div class="selector-header">
        <h5>🌐 Protocol Selection</h5>
        <p class="text-muted">Choose the protocol that best fits your use case</p>
      </div>

      <div class="protocol-grid">
        <div 
          *ngFor="let protocol of protocols" 
          class="protocol-card"
          [class.selected]="selectedProtocol === protocol.id"
          [class.connected]="protocol.connected"
          [class.error]="protocol.status === 'error'"
          (click)="selectProtocol(protocol.id)">
          
          <div class="protocol-header">
            <div class="protocol-icon">{{ protocol.icon }}</div>
            <div class="protocol-info">
              <h6>{{ protocol.name }}</h6>
              <span class="protocol-status" [class]="protocol.status">
                {{ getStatusText(protocol.status) }}
              </span>
            </div>
          </div>

          <p class="protocol-description">{{ protocol.description }}</p>

          <div class="protocol-features">
            <div *ngFor="let feature of protocol.features" class="feature-item">
              <span class="feature-icon">✓</span>
              <span class="feature-text">{{ feature }}</span>
            </div>
          </div>

          <div class="protocol-actions">
            <button 
              *ngIf="protocol.status === 'disconnected'"
              class="btn btn-sm btn-outline-primary"
              (click)="connectProtocol(protocol.id); $event.stopPropagation()">
              Connect
            </button>
            <button 
              *ngIf="protocol.status === 'connected'"
              class="btn btn-sm btn-outline-secondary"
              (click)="disconnectProtocol(protocol.id); $event.stopPropagation()">
              Disconnect
            </button>
            <button 
              *ngIf="protocol.status === 'error'"
              class="btn btn-sm btn-outline-warning"
              (click)="retryConnection(protocol.id); $event.stopPropagation()">
              Retry
            </button>
          </div>
        </div>
      </div>

      <div class="protocol-details" *ngIf="selectedProtocol">
        <h6>📋 {{ getSelectedProtocolName() }} Details</h6>
        <div class="details-content">
          <div class="detail-section">
            <h6>Use Cases</h6>
            <ul>
              <li *ngFor="let useCase of getSelectedProtocolUseCases()">{{ useCase }}</li>
            </ul>
          </div>
          <div class="detail-section">
            <h6>Configuration</h6>
            <div class="config-form">
              <div *ngIf="selectedProtocol === 's3'" class="config-group">
                <label>AWS Access Key ID</label>
                <input 
                  type="text" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="s3Config.accessKeyId"
                  placeholder="Enter AWS Access Key ID">
                
                <label>AWS Secret Access Key</label>
                <input 
                  type="password" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="s3Config.secretAccessKey"
                  placeholder="Enter AWS Secret Access Key">
                
                <label>Region</label>
                <select class="form-control form-control-sm" [(ngModel)]="s3Config.region">
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU West (Ireland)</option>
                </select>
              </div>

              <div *ngIf="selectedProtocol === 'mcp'" class="config-group">
                <label>Server URL</label>
                <input 
                  type="text" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="mcpConfig.serverUrl"
                  placeholder="http://localhost:8080">
                
                <label>API Key</label>
                <input 
                  type="password" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="mcpConfig.apiKey"
                  placeholder="Enter MCP API Key">
              </div>

              <div *ngIf="selectedProtocol === 'websocket'" class="config-group">
                <label>WebSocket URL</label>
                <input 
                  type="text" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="wsConfig.url"
                  placeholder="ws://localhost:3000/cable">
                
                <label>Auth Token</label>
                <input 
                  type="password" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="wsConfig.token"
                  placeholder="Enter authentication token">
              </div>

              <div *ngIf="selectedProtocol === 'rest'" class="config-group">
                <label>API URL</label>
                <input 
                  type="text" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="restConfig.apiUrl"
                  placeholder="http://localhost:3000/api/v1">
                
                <label>API Key</label>
                <input 
                  type="password" 
                  class="form-control form-control-sm" 
                  [(ngModel)]="restConfig.apiKey"
                  placeholder="Enter API Key">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .protocol-selector {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .selector-header {
      margin-bottom: 24px;
      text-align: center;
    }

    .selector-header h5 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .selector-header p {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
    }

    .protocol-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .protocol-card {
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .protocol-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
    }

    .protocol-card.selected {
      border-color: #3b82f6;
      background-color: #f0f9ff;
    }

    .protocol-card.connected {
      border-color: #10b981;
    }

    .protocol-card.error {
      border-color: #ef4444;
    }

    .protocol-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .protocol-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .protocol-info h6 {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .protocol-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 500;
    }

    .protocol-status.connected {
      background-color: #d1fae5;
      color: #065f46;
    }

    .protocol-status.disconnected {
      background-color: #f3f4f6;
      color: #374151;
    }

    .protocol-status.error {
      background-color: #fee2e2;
      color: #991b1b;
    }

    .protocol-description {
      font-size: 13px;
      color: #6b7280;
      margin: 0 0 12px 0;
      line-height: 1.4;
    }

    .protocol-features {
      margin-bottom: 16px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #374151;
      margin-bottom: 4px;
    }

    .feature-icon {
      color: #10b981;
      font-weight: bold;
    }

    .protocol-actions {
      display: flex;
      justify-content: flex-end;
    }

    .protocol-details {
      border-top: 1px solid #e5e7eb;
      padding-top: 20px;
    }

    .protocol-details h6 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .details-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .detail-section h7 {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #374151;
    }

    .detail-section ul {
      margin: 0;
      padding-left: 16px;
    }

    .detail-section li {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .config-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .config-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .config-group label {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }

    .config-group input,
    .config-group select {
      font-size: 13px;
    }

    @media (max-width: 768px) {
      .protocol-grid {
        grid-template-columns: 1fr;
      }
      
      .details-content {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ProtocolSelectorComponent {
  @Output() protocolSelected = new EventEmitter<Protocol>();
  @Output() protocolConfigured = new EventEmitter<{protocol: Protocol, config: any}>();

  selectedProtocol: Protocol = 'rest';
  
  protocols: ProtocolConfig[] = [
    {
      id: 'rest',
      name: 'REST API',
      description: 'Modern JSON API for web and mobile applications',
      icon: '🌐',
      features: ['JSON responses', 'JWT authentication', 'Modern apps', 'Web/mobile'],
      connected: true,
      status: 'connected'
    },
    {
      id: 's3',
      name: 'S3 API',
      description: 'AWS S3-compatible API for existing tools and SDKs',
      icon: '📦',
      features: ['AWS SDK compatible', 'Migration ready', 'Existing tools', 'Zero code changes'],
      connected: false,
      status: 'disconnected'
    },
    {
      id: 'mcp',
      name: 'MCP Protocol',
      description: 'Model Context Protocol for AI model integration',
      icon: '🤖',
      features: ['AI integration', 'Tool interface', 'Resource management', 'AI assistants'],
      connected: false,
      status: 'disconnected'
    },
    {
      id: 'websocket',
      name: 'WebSocket',
      description: 'Real-time notifications and live updates',
      icon: '⚡',
      features: ['Real-time events', 'Live notifications', 'Interactive apps', 'Monitoring'],
      connected: false,
      status: 'disconnected'
    }
  ];

  // Configuration objects
  s3Config = {
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1'
  };

  mcpConfig = {
    serverUrl: 'http://localhost:8080',
    apiKey: ''
  };

  wsConfig = {
    url: 'ws://localhost:3000/cable',
    token: ''
  };

  restConfig = {
    apiUrl: 'http://localhost:3000/api/v1',
    apiKey: ''
  };

  selectProtocol(protocol: Protocol): void {
    this.selectedProtocol = protocol;
    this.protocolSelected.emit(protocol);
  }

  connectProtocol(protocol: Protocol): void {
    // Simulate connection - in production, actually connect to the service
    const protocolConfig = this.protocols.find(p => p.id === protocol);
    if (protocolConfig) {
      protocolConfig.status = 'connected';
      protocolConfig.connected = true;
    }
  }

  disconnectProtocol(protocol: Protocol): void {
    const protocolConfig = this.protocols.find(p => p.id === protocol);
    if (protocolConfig) {
      protocolConfig.status = 'disconnected';
      protocolConfig.connected = false;
    }
  }

  retryConnection(protocol: Protocol): void {
    const protocolConfig = this.protocols.find(p => p.id === protocol);
    if (protocolConfig) {
      protocolConfig.status = 'connected';
      protocolConfig.connected = true;
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  }

  getSelectedProtocolName(): string {
    const protocol = this.protocols.find(p => p.id === this.selectedProtocol);
    return protocol ? protocol.name : '';
  }

  getSelectedProtocolUseCases(): string[] {
    switch (this.selectedProtocol) {
      case 'rest':
        return ['Web applications', 'Mobile apps', 'API integrations', 'Modern development'];
      case 's3':
        return ['AWS SDK migration', 'Existing tools', 'S3cmd, rclone', 'Zero code changes'];
      case 'mcp':
        return ['AI model integration', 'Automated workflows', 'AI assistants', 'Tool orchestration'];
      case 'websocket':
        return ['Real-time monitoring', 'Live notifications', 'Interactive dashboards', 'Event streaming'];
      default:
        return [];
    }
  }

  saveConfiguration(): void {
    let config: any = {};
    
    switch (this.selectedProtocol) {
      case 's3':
        config = { ...this.s3Config };
        // Store in localStorage for persistence
        localStorage.setItem('aws_access_key_id', this.s3Config.accessKeyId);
        localStorage.setItem('aws_secret_access_key', this.s3Config.secretAccessKey);
        break;
      case 'mcp':
        config = { ...this.mcpConfig };
        break;
      case 'websocket':
        config = { ...this.wsConfig };
        break;
      case 'rest':
        config = { ...this.restConfig };
        break;
    }

    this.protocolConfigured.emit({ protocol: this.selectedProtocol, config });
  }
}
