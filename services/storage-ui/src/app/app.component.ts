import { Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SessionService } from './services/session.service';
import { WebsocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="min-h-screen bg-gray-50">
      <app-navbar />
      <main class="container mx-auto px-4 py-8">
        <router-outlet />
      </main>
      
      <!-- Multi-Protocol Status Bar -->
      <div class="protocol-status-bar fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50">
        <div class="container mx-auto flex items-center justify-between text-sm">
          <div class="protocol-indicators flex items-center gap-4">
            <div class="indicator">
              <span class="status-dot connected"></span>
              <span>REST API</span>
            </div>
            <div class="indicator">
              <span class="status-dot" [class.connected]="s3Connected" [class.disconnected]="!s3Connected"></span>
              <span>S3 API</span>
            </div>
            <div class="indicator">
              <span class="status-dot" [class.connected]="mcpConnected" [class.disconnected]="!mcpConnected"></span>
              <span>MCP Protocol</span>
            </div>
            <div class="indicator">
              <span class="status-dot" [class.connected]="wsConnected" [class.disconnected]="!wsConnected"></span>
              <span>WebSocket</span>
            </div>
          </div>
          
          <div class="status-text text-gray-600">
            {{ getConnectionStatusText() }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .protocol-status-bar {
      box-shadow: 0 -2px 4px rgba(0,0,0,0.1);
    }
    
    .indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .status-dot.connected {
      background-color: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }
    
    .status-dot.disconnected {
      background-color: #ef4444;
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
    }
    
    @media (max-width: 768px) {
      .protocol-indicators {
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .indicator {
        font-size: 12px;
      }
      
      .status-text {
        display: none;
      }
    }
  `]
})
export class AppComponent implements OnDestroy {
  private sessionService = inject(SessionService);
  private websocketService = inject(WebsocketService);

  // Protocol connection status
  s3Connected: boolean = false;
  mcpConnected: boolean = false;
  wsConnected: boolean = false;

  constructor() {
    // Initialize session monitoring when app starts
    this.initializeProtocolConnections();
  }

  private initializeProtocolConnections(): void {
    // Check S3 credentials
    const accessKey = localStorage.getItem('aws_access_key_id');
    const secretKey = localStorage.getItem('aws_secret_access_key');
    this.s3Connected = !!(accessKey && secretKey);

    // Check MCP connection (simplified - would check actual connection)
    this.mcpConnected = true; // Assume connected for now

    // Initialize WebSocket connection
    const token = localStorage.getItem('auth_token');
    if (token) {
      this.websocketService.connect(token);
    }

    // Subscribe to WebSocket status
    this.websocketService.getConnectionStatus().subscribe(connected => {
      this.wsConnected = connected;
    });
  }

  getConnectionStatusText(): string {
    const connectedCount = [this.s3Connected, this.mcpConnected, this.wsConnected].filter(Boolean).length;
    const totalCount = 3;
    
    if (connectedCount === totalCount) {
      return '🟢 All protocols connected';
    } else if (connectedCount === 0) {
      return '🔴 No protocols connected';
    } else {
      return `🟡 ${connectedCount}/${totalCount} protocols connected`;
    }
  }

  ngOnDestroy(): void {
    // Cleanup session service when app is destroyed
    this.sessionService.destroy();
    this.websocketService.disconnect();
  }
}
