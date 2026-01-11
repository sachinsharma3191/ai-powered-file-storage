import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabsModule } from 'ngx-bootstrap/tabs';
import { ProtocolSelectorComponent } from '../../components/protocol-selector/protocol-selector.component';
import { S3BrowserComponent } from '../../components/s3-browser/s3-browser.component';
import { McpToolsComponent } from '../../components/mcp-tools/mcp-tools.component';
import { RealTimeNotificationsComponent } from '../../components/real-time-notifications/real-time-notifications.component';
import { BucketObjectsComponent } from '../../components/bucket-objects/bucket-objects.component';
import { ChatInterfaceComponent } from '../../components/chat-interface/chat-interface.component';
import { BackendStatusComponent } from '../../components/backend-status/backend-status.component';

@Component({
  selector: 'app-multi-protocol-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TabsModule,
    ProtocolSelectorComponent,
    S3BrowserComponent,
    McpToolsComponent,
    RealTimeNotificationsComponent,
    BucketObjectsComponent,
    ChatInterfaceComponent,
    BackendStatusComponent
  ],
  template: `
    <div class="multi-protocol-dashboard">
      <div class="dashboard-header">
        <h2>🌐 Multi-Protocol Storage Dashboard</h2>
        <p class="text-muted">Manage your storage using multiple protocols and interfaces</p>
      </div>

      <!-- Backend Services Status -->
      <app-backend-status></app-backend-status>

      <!-- Protocol Configuration Section -->
      <div class="protocol-section">
        <app-protocol-selector 
          (protocolSelected)="onProtocolSelected($event)"
          (protocolConfigured)="onProtocolConfigured($event)">
        </app-protocol-selector>
      </div>

      <!-- Main Content Tabs -->
      <div class="content-section">
        <tabset>
          <!-- REST API Tab -->
          <tab heading="🌐 REST API" [disabled]="!isProtocolEnabled('rest')">
            <div class="tab-content">
              <div class="tab-header">
                <h5>Modern JSON API</h5>
                <p class="text-muted">Use our modern REST API for web and mobile applications</p>
              </div>
              
              <div class="row">
                <div class="col-lg-8">
                  <app-bucket-objects></app-bucket-objects>
                </div>
                <div class="col-lg-4">
                  <app-real-time-notifications 
                    [showNotifications]="true"
                    [authToken]="authToken">
                  </app-real-time-notifications>
                </div>
              </div>
            </div>
          </tab>

          <!-- S3 API Tab -->
          <tab heading="📦 S3 API" [disabled]="!isProtocolEnabled('s3')">
            <div class="tab-content">
              <div class="tab-header">
                <h5>AWS S3 Compatible API</h5>
                <p class="text-muted">Full AWS S3 compatibility for existing tools and SDKs</p>
              </div>
              
              <div class="alert alert-info">
                <h6>🚀 Migration Ready</h6>
                <p>Use your existing AWS SDK code with zero changes! Just point your SDK to our S3 endpoint.</p>
                <code>endpoint: 'http://localhost:3000/s3'</code>
              </div>

              <app-s3-browser></app-s3-browser>
            </div>
          </tab>

          <!-- MCP Protocol Tab -->
          <tab heading="🤖 MCP Protocol" [disabled]="!isProtocolEnabled('mcp')">
            <div class="tab-content">
              <div class="tab-header">
                <h5>Model Context Protocol</h5>
                <p class="text-muted">AI integration with standardized tool interface</p>
              </div>
              
              <div class="row">
                <div class="col-lg-8">
                  <app-mcp-tools></app-mcp-tools>
                </div>
                <div class="col-lg-4">
                  <div class="info-card">
                    <h6>🤖 AI Integration</h6>
                    <p>The MCP protocol enables AI models to directly interact with your storage:</p>
                    <ul>
                      <li>Natural language storage management</li>
                      <li>Automated workflows</li>
                      <li>AI-powered file operations</li>
                      <li>Tool orchestration</li>
                    </ul>
                    
                    <div class="mt-3">
                      <h6>Available Tools</h6>
                      <div class="tool-list">
                        <span class="tool-badge">list_buckets</span>
                        <span class="tool-badge">create_bucket</span>
                        <span class="tool-badge">list_objects</span>
                        <span class="tool-badge">search_objects</span>
                        <span class="tool-badge">get_download_url</span>
                        <span class="tool-badge">delete_object</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </tab>

          <!-- WebSocket Tab -->
          <tab heading="⚡ WebSocket" [disabled]="!isProtocolEnabled('websocket')">
            <div class="tab-content">
              <div class="tab-header">
                <h5>Real-time Events</h5>
                <p class="text-muted">Live notifications and event streaming</p>
              </div>
              
              <div class="row">
                <div class="col-lg-6">
                  <div class="event-demo">
                    <h6>🔔 Live Event Stream</h6>
                    <app-real-time-notifications 
                      [showNotifications]="true"
                      [authToken]="authToken"
                      [bucketId]="selectedBucketId">
                    </app-real-time-notifications>
                  </div>
                </div>
                <div class="col-lg-6">
                  <div class="event-info">
                    <h6>📡 Event Types</h6>
                    <div class="event-list">
                      <div class="event-type">
                        <span class="event-icon">📄</span>
                        <span class="event-name">object_created</span>
                        <span class="event-desc">New file uploaded</span>
                      </div>
                      <div class="event-type">
                        <span class="event-icon">🔄</span>
                        <span class="event-name">object_updated</span>
                        <span class="event-desc">File modified</span>
                      </div>
                      <div class="event-type">
                        <span class="event-icon">🗑️</span>
                        <span class="event-name">object_deleted</span>
                        <span class="event-desc">File removed</span>
                      </div>
                      <div class="event-type">
                        <span class="event-icon">📦</span>
                        <span class="event-name">bucket_created</span>
                        <span class="event-desc">New bucket created</span>
                      </div>
                      <div class="event-type">
                        <span class="event-icon">⬆️</span>
                        <span class="event-name">upload_progress</span>
                        <span class="event-desc">Upload progress updates</span>
                      </div>
                    </div>
                    
                    <div class="mt-3">
                      <h6>🔗 Connection Info</h6>
                      <code>ws://localhost:3000/cable?token=YOUR_TOKEN</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </tab>

          <!-- Protocol Comparison Tab -->
          <tab heading="📊 Comparison">
            <div class="tab-content">
              <div class="tab-header">
                <h5>Protocol Comparison</h5>
                <p class="text-muted">Choose the right protocol for your use case</p>
              </div>
              
              <div class="comparison-table">
                <table class="table table-bordered">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>REST API</th>
                      <th>S3 API</th>
                      <th>MCP Protocol</th>
                      <th>WebSocket</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Use Case</strong></td>
                      <td>Web/Mobile Apps</td>
                      <td>Migration/Tools</td>
                      <td>AI Integration</td>
                      <td>Real-time</td>
                    </tr>
                    <tr>
                      <td><strong>Authentication</strong></td>
                      <td>JWT Bearer</td>
                      <td>AWS Signature V4</td>
                      <td>JWT Bearer</td>
                      <td>JWT Bearer</td>
                    </tr>
                    <tr>
                      <td><strong>Multipart Upload</strong></td>
                      <td>✅</td>
                      <td>✅</td>
                      <td>❌</td>
                      <td>❌</td>
                    </tr>
                    <tr>
                      <td><strong>Metadata Support</strong></td>
                      <td>✅</td>
                      <td>✅</td>
                      <td>✅</td>
                      <td>✅</td>
                    </tr>
                    <tr>
                      <td><strong>Real-time Events</strong></td>
                      <td>❌</td>
                      <td>❌</td>
                      <td>✅</td>
                      <td>✅</td>
                    </tr>
                    <tr>
                      <td><strong>AI Integration</strong></td>
                      <td>❌</td>
                      <td>❌</td>
                      <td>✅</td>
                      <td>❌</td>
                    </tr>
                    <tr>
                      <td><strong>SDK Support</strong></td>
                      <td>HTTP Clients</td>
                      <td>AWS SDKs</td>
                      <td>MCP Clients</td>
                      <td>WebSocket Clients</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="recommendations">
                <h6>🎯 Recommendations</h6>
                <div class="row">
                  <div class="col-md-6">
                    <div class="recommendation-card">
                      <h6>🌐 For Web Applications</h6>
                      <p>Use the REST API for modern web and mobile applications with JWT authentication.</p>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="recommendation-card">
                      <h6>📦 For Migration</h6>
                      <p>Use the S3 API to migrate existing AWS applications with zero code changes.</p>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="recommendation-card">
                      <h6>🤖 For AI Integration</h6>
                      <p>Use the MCP protocol to enable AI models to manage storage operations.</p>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="recommendation-card">
                      <h6>⚡ For Real-time Apps</h6>
                      <p>Use WebSocket for live notifications and real-time updates.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </tab>
        </tabset>
      </div>

      <!-- Chat Interface -->
      <app-chat-interface></app-chat-interface>
    </div>
  `,
  styles: [`
    .multi-protocol-dashboard {
      padding-bottom: 80px; /* Account for status bar */
    }

    .dashboard-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .dashboard-header h2 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
    }

    .dashboard-header p {
      margin: 0;
      font-size: 16px;
      color: #6b7280;
    }

    .protocol-section {
      margin-bottom: 32px;
    }

    .content-section {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .tab-content {
      padding: 24px;
    }

    .tab-header {
      margin-bottom: 24px;
      text-align: center;
    }

    .tab-header h5 {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 600;
    }

    .tab-header p {
      margin: 0;
      color: #6b7280;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
    }

    .info-card h6 {
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .info-card ul {
      margin: 0 0 16px 0;
      padding-left: 16px;
    }

    .info-card li {
      margin-bottom: 4px;
      font-size: 14px;
    }

    .tool-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tool-badge {
      background: #3b82f6;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }

    .event-demo {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
    }

    .event-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
    }

    .event-list {
      margin-bottom: 16px;
    }

    .event-type {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .event-type:last-child {
      border-bottom: none;
    }

    .event-icon {
      font-size: 16px;
      width: 20px;
    }

    .event-name {
      font-weight: 500;
      min-width: 120px;
    }

    .event-desc {
      color: #6b7280;
      font-size: 14px;
    }

    .comparison-table {
      margin-bottom: 32px;
      overflow-x: auto;
    }

    .comparison-table table {
      margin: 0;
    }

    .comparison-table th {
      background: #f8fafc;
      font-weight: 600;
      border-color: #e2e8f0;
    }

    .comparison-table td {
      vertical-align: middle;
      border-color: #e2e8f0;
    }

    .recommendations h6 {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .recommendation-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .recommendation-card h6 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .recommendation-card p {
      margin: 0;
      font-size: 13px;
      color: #6b7280;
    }

    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }

    @media (max-width: 768px) {
      .dashboard-header h2 {
        font-size: 24px;
      }
      
      .tab-content {
        padding: 16px;
      }
      
      .comparison-table {
        font-size: 12px;
      }
    }
  `]
})
export class MultiProtocolDashboardComponent implements OnInit {
  enabledProtocols: Set<string> = new Set(['rest']); // REST API is always enabled
  authToken: string = '';
  selectedBucketId: number | undefined;

  ngOnInit(): void {
    // Get auth token from storage
    this.authToken = localStorage.getItem('auth_token') || '';
    
    // Check enabled protocols
    this.checkEnabledProtocols();
  }

  onProtocolSelected(protocol: string): void {
    console.log('Protocol selected:', protocol);
    // Additional logic when protocol is selected
  }

  onProtocolConfigured(config: { protocol: string, config: any }): void {
    console.log('Protocol configured:', config);
    
    // Enable the protocol
    this.enabledProtocols.add(config.protocol);
    
    // Store configuration if needed
    switch (config.protocol) {
      case 's3':
        localStorage.setItem('aws_access_key_id', config.config.accessKeyId);
        localStorage.setItem('aws_secret_access_key', config.config.secretAccessKey);
        break;
      case 'mcp':
        localStorage.setItem('mcp_config', JSON.stringify(config.config));
        break;
      case 'websocket':
        localStorage.setItem('ws_config', JSON.stringify(config.config));
        break;
      case 'rest':
        localStorage.setItem('rest_config', JSON.stringify(config.config));
        break;
    }
  }

  isProtocolEnabled(protocol: string): boolean {
    return this.enabledProtocols.has(protocol);
  }

  private checkEnabledProtocols(): void {
    // Check S3 credentials
    const s3AccessKey = localStorage.getItem('aws_access_key_id');
    const s3SecretKey = localStorage.getItem('aws_secret_access_key');
    if (s3AccessKey && s3SecretKey) {
      this.enabledProtocols.add('s3');
    }

    // Check MCP configuration
    const mcpConfig = localStorage.getItem('mcp_config');
    if (mcpConfig) {
      this.enabledProtocols.add('mcp');
    }

    // Check WebSocket configuration
    const wsConfig = localStorage.getItem('ws_config');
    if (wsConfig) {
      this.enabledProtocols.add('websocket');
    }

    // REST API is always enabled
    this.enabledProtocols.add('rest');
  }
}
