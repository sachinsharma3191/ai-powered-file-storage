import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { BackendIntegrationService, BackendHealth, ServiceStatus } from '../../services/backend-integration.service';

@Component({
  selector: 'app-backend-status',
  standalone: true,
  imports: [],
  template: `
    <div class="backend-status">
      <div class="status-header">
        <h5>🔧 Backend Services</h5>
        <div class="overall-status" [class]="getOverallStatusClass()">
          {{ getOverallStatusIcon() }} {{ getOverallStatusText() }}
        </div>
      </div>
      
      <div class="services-list">
        <div class="service-item" 
             *ngFor="let service of healthStatus.services" 
             [class]="getServiceStatusClass(service.status)">
          <div class="service-info">
            <span class="service-name">{{ service.name }}</span>
            <span class="service-url">{{ service.url }}</span>
          </div>
          <div class="service-metrics">
            <span class="status-indicator" [class]="service.status">
              {{ getStatusIcon(service.status) }}
            </span>
            <span class="response-time" *ngIf="service.responseTime">
              {{ service.responseTime }}ms
            </span>
          </div>
        </div>
      </div>
      
      <div class="status-footer">
        <small>Last checked: {{ healthStatus.timestamp | date:'short' }}</small>
        <button class="btn btn-sm btn-outline-primary" (click)="refreshStatus()">
          🔄 Refresh
        </button>
      </div>
    </div>
  `,
  styles: [`
    .backend-status {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }

    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .status-header h5 {
      margin: 0;
      color: #495057;
    }

    .overall-status {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .overall-status.healthy {
      background: #d4edda;
      color: #155724;
    }

    .overall-status.degraded {
      background: #fff3cd;
      color: #856404;
    }

    .overall-status.down {
      background: #f8d7da;
      color: #721c24;
    }

    .services-list {
      margin-bottom: 16px;
    }

    .service-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      margin-bottom: 4px;
      border-radius: 6px;
      background: white;
      border: 1px solid #e9ecef;
    }

    .service-item.online {
      border-left: 4px solid #28a745;
    }

    .service-item.offline {
      border-left: 4px solid #dc3545;
    }

    .service-item.error {
      border-left: 4px solid #ffc107;
    }

    .service-info {
      flex: 1;
    }

    .service-name {
      display: block;
      font-weight: 500;
      color: #495057;
    }

    .service-url {
      display: block;
      font-size: 11px;
      color: #6c757d;
    }

    .service-metrics {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-indicator {
      font-size: 16px;
    }

    .status-indicator.online::before {
      content: '🟢';
    }

    .status-indicator.offline::before {
      content: '🔴';
    }

    .status-indicator.error::before {
      content: '🟡';
    }

    .response-time {
      font-size: 11px;
      color: #6c757d;
    }

    .status-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #6c757d;
    }

    .btn {
      padding: 2px 8px;
      font-size: 11px;
    }
  `]
})
export class BackendStatusComponent implements OnInit, OnDestroy {
  healthStatus: BackendHealth = {
    overall: 'down',
    services: [],
    timestamp: new Date()
  };

  private healthSubscription: Subscription | null = null;

  constructor(private backendIntegration: BackendIntegrationService) {}

  ngOnInit(): void {
    this.healthSubscription = this.backendIntegration.healthStatus$.subscribe(
      status => {
        this.healthStatus = status;
      }
    );
  }

  ngOnDestroy(): void {
    if (this.healthSubscription) {
      this.healthSubscription.unsubscribe();
    }
  }

  refreshStatus(): void {
    this.backendIntegration.checkAllServices();
  }

  getOverallStatusClass(): string {
    return this.healthStatus.overall;
  }

  getOverallStatusIcon(): string {
    switch (this.healthStatus.overall) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'down': return '❌';
      default: return '❓';
    }
  }

  getOverallStatusText(): string {
    switch (this.healthStatus.overall) {
      case 'healthy': return 'All Systems Operational';
      case 'degraded': return 'Some Issues Detected';
      case 'down': return 'System Down';
      default: return 'Unknown Status';
    }
  }

  getServiceStatusClass(status: string): string {
    return status;
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'online': return '🟢';
      case 'offline': return '🔴';
      case 'error': return '🟡';
      default: return '⚪';
    }
  }
}
