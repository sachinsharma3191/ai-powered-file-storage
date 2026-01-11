import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { BackendIntegrationService } from './backend-integration.service';

export interface StorageEvent {
  type: string;
  account_id: number;
  bucket_id: number;
  object_key?: string;
  payload: any;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private eventSubject = new Subject<StorageEvent>();
  private connectionStatusSubject = new Subject<boolean>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private websocketUrl: string;

  constructor(private backendIntegration: BackendIntegrationService) {
    // Use backend integration for service discovery
    const serviceUrls = this.backendIntegration.getServiceUrls();
    this.websocketUrl = serviceUrls.websocketUrl;
  }

  connect(token: string, bucketId?: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    // Use the configured WebSocket URL from backend integration
    const wsUrl = `${this.websocketUrl}?token=${token}`;
    
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.connectionStatusSubject.next(true);
      this.reconnectAttempts = 0;

      // Subscribe to storage events
      this.subscribeToEvents(bucketId);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          // Respond to ping
          this.socket?.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (data.message) {
          const storageEvent: StorageEvent = data.message;
          this.eventSubject.next(storageEvent);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      this.connectionStatusSubject.next(false);
      this.attemptReconnect(token, bucketId);
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connectionStatusSubject.next(false);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.reconnectAttempts = 0;
  }

  private subscribeToEvents(bucketId?: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Subscribe to account-wide events
    this.sendCommand('subscribe', { channel: 'StorageEventsChannel' });

    // Subscribe to bucket-specific events if provided
    if (bucketId) {
      this.sendCommand('subscribe', { 
        channel: 'StorageEventsChannel',
        bucket_id: bucketId 
      });
    }
  }

  private sendCommand(action: string, data: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const command = {
      command: action,
      identifier: JSON.stringify({
        channel: 'StorageEventsChannel',
        ...data
      })
    };

    this.socket.send(JSON.stringify(command));
  }

  private attemptReconnect(token: string, bucketId?: number): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(token, bucketId);
    }, delay);
  }

  getEvents(): Observable<StorageEvent> {
    return this.eventSubject.asObservable();
  }

  getConnectionStatus(): Observable<boolean> {
    return this.connectionStatusSubject.asObservable();
  }

  subscribeToBucket(bucketId: number): void {
    this.sendCommand('message', {
      action: 'subscribe_bucket',
      bucket_id: bucketId
    });
  }

  unsubscribeFromBucket(bucketId: number): void {
    this.sendCommand('message', {
      action: 'unsubscribe_bucket',
      bucket_id: bucketId
    });
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
