import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebsocketService, StorageEvent } from '../../services/websocket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-real-time-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="real-time-notifications" *ngIf="showNotifications">
      <div class="notification-header">
        <h6>🔔 Real-time Events</h6>
        <div class="status-indicator" [class.connected]="isConnected" [class.disconnected]="!isConnected">
          <span class="status-dot"></span>
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </div>
      </div>
      
      <div class="events-container">
        <div class="event-item" 
             *ngFor="let event of recentEvents" 
             [class]="getEventClass(event.type)">
          <div class="event-icon">{{ getEventIcon(event.type) }}</div>
          <div class="event-content">
            <div class="event-title">{{ getEventTitle(event.type) }}</div>
            <div class="event-details" *ngIf="event.object_key">
              Object: {{ event.object_key }}
            </div>
            <div class="event-time">{{ formatTime(event.timestamp) }}</div>
          </div>
        </div>
        
        <div class="no-events" *ngIf="recentEvents.length === 0">
          No recent events
        </div>
      </div>
    </div>
  `,
  styles: [`
    .real-time-notifications {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
    }

    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }

    .notification-header h6 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      font-size: 12px;
      gap: 4px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .connected .status-dot {
      background-color: #10b981;
    }

    .disconnected .status-dot {
      background-color: #ef4444;
    }

    .events-container {
      max-height: 300px;
      overflow-y: auto;
    }

    .event-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .event-item:last-child {
      border-bottom: none;
    }

    .event-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .event-content {
      flex: 1;
      min-width: 0;
    }

    .event-title {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 2px;
    }

    .event-details {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 2px;
      word-break: break-all;
    }

    .event-time {
      font-size: 11px;
      color: #9ca3af;
    }

    .no-events {
      text-align: center;
      color: #6b7280;
      font-size: 13px;
      padding: 20px 0;
    }

    .event-item.object_created {
      border-left: 3px solid #10b981;
    }

    .event-item.object_updated {
      border-left: 3px solid #3b82f6;
    }

    .event-item.object_deleted {
      border-left: 3px solid #ef4444;
    }

    .event-item.bucket_created {
      border-left: 3px solid #8b5cf6;
    }

    .event-item.bucket_deleted {
      border-left: 3px solid #f59e0b;
    }

    .event-item.multipart_upload_started {
      border-left: 3px solid #06b6d4;
    }

    .event-item.multipart_upload_completed {
      border-left: 3px solid #10b981;
    }

    .event-item.upload_progress {
      border-left: 3px solid #3b82f6;
    }
  `]
})
export class RealTimeNotificationsComponent implements OnInit, OnDestroy {
  @Input() showNotifications: boolean = true;
  @Input() authToken: string = '';
  @Input() bucketId?: number;

  recentEvents: StorageEvent[] = [];
  isConnected: boolean = false;
  private subscriptions: Subscription[] = [];
  private maxEvents: number = 50;

  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    if (this.authToken) {
      this.connect();
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private connect(): void {
    // Subscribe to connection status
    const statusSub = this.websocketService.getConnectionStatus()
      .subscribe(connected => {
        this.isConnected = connected;
      });

    // Subscribe to events
    const eventsSub = this.websocketService.getEvents()
      .subscribe(event => {
        this.addEvent(event);
      });

    this.subscriptions.push(statusSub, eventsSub);

    // Connect to WebSocket
    this.websocketService.connect(this.authToken, this.bucketId);
  }

  private disconnect(): void {
    this.websocketService.disconnect();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private addEvent(event: StorageEvent): void {
    this.recentEvents.unshift(event);
    
    // Keep only the most recent events
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents = this.recentEvents.slice(0, this.maxEvents);
    }
  }

  getEventClass(eventType: string): string {
    return eventType.replace(/_/g, '-');
  }

  getEventIcon(eventType: string): string {
    const icons: { [key: string]: string } = {
      'object_created': '📄',
      'object_updated': '🔄',
      'object_deleted': '🗑️',
      'bucket_created': '📦',
      'bucket_deleted': '🗑️',
      'multipart_upload_started': '⬆️',
      'multipart_upload_completed': '✅',
      'upload_progress': '📊'
    };
    return icons[eventType] || '📋';
  }

  getEventTitle(eventType: string): string {
    const titles: { [key: string]: string } = {
      'object_created': 'Object Created',
      'object_updated': 'Object Updated',
      'object_deleted': 'Object Deleted',
      'bucket_created': 'Bucket Created',
      'bucket_deleted': 'Bucket Deleted',
      'multipart_upload_started': 'Upload Started',
      'multipart_upload_completed': 'Upload Completed',
      'upload_progress': 'Upload Progress'
    };
    return titles[eventType] || 'Storage Event';
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}
