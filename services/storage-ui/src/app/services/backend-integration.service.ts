import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of, throwError } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ServiceStatus {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'error';
  responseTime?: number;
  lastChecked: Date;
  version?: string;
}

export interface BackendHealth {
  overall: 'healthy' | 'degraded' | 'down';
  services: ServiceStatus[];
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BackendIntegrationService {
  private readonly services = [
    { name: 'Storage Control Plane', url: environment.apiUrl, type: 'api' },
    { name: 'MCP Server', url: environment.mcpUrl, type: 'api' },
    { name: 'Chunk Gateway', url: environment.chunkGatewayUrl, type: 'api' },
    { name: 'Notification Service', url: environment.notificationServiceUrl, type: 'api' },
    { name: 'Agent Service', url: environment.agentServiceUrl, type: 'api' },
    { name: 'S3 API', url: environment.s3ApiUrl, type: 's3' },
    { name: 'WebSocket', url: environment.websocketUrl, type: 'websocket' },
    { name: 'Outbox Worker', url: environment.outboxWorkerUrl, type: 'api' }
  ];

  private healthStatus = new BehaviorSubject<BackendHealth>({
    overall: 'down',
    services: [],
    timestamp: new Date()
  });

  healthStatus$ = this.healthStatus.asObservable();

  constructor(private http: HttpClient) {
    this.startHealthChecks();
  }

  // Start periodic health checks
  private startHealthChecks(): void {
    this.checkAllServices();
    // Check every 30 seconds
    setInterval(() => this.checkAllServices(), 30000);
  }

  // Check health of all services
  checkAllServices(): void {
    const serviceChecks = this.services.map(service => 
      this.checkServiceHealth(service).pipe(
        catchError(error => of({
          name: service.name,
          url: service.url,
          status: 'error' as const,
          lastChecked: new Date(),
          responseTime: undefined
        }))
      )
    );

    // Execute all checks in parallel
    let completed = 0;
    const results: ServiceStatus[] = [];

    serviceChecks.forEach((check$, index) => {
      check$.subscribe({
        next: (result) => {
          results[index] = result;
          completed++;
          
          if (completed === this.services.length) {
            const overallHealth = this.calculateOverallHealth(results);
            this.healthStatus.next({
              overall: overallHealth,
              services: results,
              timestamp: new Date()
            });
          }
        },
        error: () => {
          results[index] = {
            name: this.services[index].name,
            url: this.services[index].url,
            status: 'error' as const,
            lastChecked: new Date()
          };
          completed++;
          
          if (completed === this.services.length) {
            const overallHealth = this.calculateOverallHealth(results);
            this.healthStatus.next({
              overall: overallHealth,
              services: results,
              timestamp: new Date()
            });
          }
        }
      });
    });
  }

  // Check individual service health
  private checkServiceHealth(service: { name: string; url: string; type: string }): Observable<ServiceStatus> {
    const startTime = Date.now();

    switch (service.type) {
      case 'websocket':
        return this.checkWebSocketHealth(service.url, startTime);
      case 's3':
        return this.checkS3Health(service.url, startTime);
      default:
        return this.checkApiHealth(service.url, startTime);
    }
  }

  // Check REST API health
  private checkApiHealth(url: string, startTime: number): Observable<ServiceStatus> {
    const healthUrl = `${url}/health`;
    
    return this.http.get(healthUrl, { 
      headers: new HttpHeaders({ 'Accept': 'application/json' }),
      responseType: 'text'
    }).pipe(
      map(() => ({
        name: this.getServiceName(url),
        url,
        status: 'online' as const,
        responseTime: Date.now() - startTime,
        lastChecked: new Date()
      })),
      catchError(error => {
        // Try alternative health endpoints
        return this.fallbackHealthCheck(url, startTime);
      })
    );
  }

  // Fallback health check for different endpoints
  private fallbackHealthCheck(url: string, startTime: number): Observable<ServiceStatus> {
    const endpoints = ['/status', '/ping', '/api/v1/health', '/'];
    
    for (const endpoint of endpoints) {
      try {
        return this.http.get(`${url}${endpoint}`, { responseType: 'text' }).pipe(
          map(() => ({
            name: this.getServiceName(url),
            url,
            status: 'online' as const,
            responseTime: Date.now() - startTime,
            lastChecked: new Date()
          }))
        );
      } catch {
        continue;
      }
    }

    // All endpoints failed
    return of({
      name: this.getServiceName(url),
      url,
      status: 'offline' as const,
      lastChecked: new Date(),
      responseTime: Date.now() - startTime
    });
  }

  // Check WebSocket health
  private checkWebSocketHealth(url: string, startTime: number): Observable<ServiceStatus> {
    return new Observable(observer => {
      try {
        const ws = new WebSocket(url);
        
        const timeout = setTimeout(() => {
          ws.close();
          observer.next({
            name: 'WebSocket',
            url,
            status: 'offline' as const,
            lastChecked: new Date(),
            responseTime: Date.now() - startTime
          });
          observer.complete();
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          observer.next({
            name: 'WebSocket',
            url,
            status: 'online',
            lastChecked: new Date(),
            responseTime: Date.now() - startTime
          });
          observer.complete();
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          observer.next({
            name: 'WebSocket',
            url,
            status: 'error' as const,
            lastChecked: new Date(),
            responseTime: Date.now() - startTime
          });
          observer.complete();
        };
      } catch (error) {
        observer.next({
          name: 'WebSocket',
          url,
          status: 'error' as const,
          lastChecked: new Date(),
          responseTime: Date.now() - startTime
        });
        observer.complete();
      }
    });
  }

  // Check S3 API health
  private checkS3Health(url: string, startTime: number): Observable<ServiceStatus> {
    // Try to list buckets as a health check
    return this.http.get(`${url}/`, { 
      headers: new HttpHeaders({ 
        'Accept': 'application/xml',
        'Authorization': 'AWS4-HMAC-SHA256 Credential=health/20230101/us-east-1/s3/aws4_request,SignedHeaders=host,Signature=health'
      }),
      responseType: 'text'
    }).pipe(
      map(() => ({
        name: 'S3 API',
        url,
        status: 'online' as const,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime
      })),
      catchError(() => of({
        name: 'S3 API',
        url,
        status: 'offline' as const,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime
      }))
    );
  }

  // Calculate overall system health
  private calculateOverallHealth(services: ServiceStatus[]): 'healthy' | 'degraded' | 'down' {
    const onlineCount = services.filter(s => s.status === 'online').length;
    const totalCount = services.length;
    
    if (onlineCount === totalCount) {
      return 'healthy';
    } else if (onlineCount > totalCount / 2) {
      return 'degraded';
    } else {
      return 'down';
    }
  }

  // Get service name from URL
  private getServiceName(url: string): string {
    const service = this.services.find(s => s.url === url);
    return service?.name || url;
  }

  // Get current health status
  getCurrentHealth(): BackendHealth {
    return this.healthStatus.value;
  }

  // Test specific service
  testService(serviceName: string): Observable<ServiceStatus> {
    const service = this.services.find(s => s.name === serviceName);
    if (!service) {
      return throwError(() => new Error(`Service ${serviceName} not found`));
    }

    return this.checkServiceHealth(service);
  }

  // Get service URLs for configuration
  getServiceUrls(): Record<string, string> {
    return {
      apiUrl: environment.apiUrl,
      mcpUrl: environment.mcpUrl,
      websocketUrl: environment.websocketUrl,
      chunkGatewayUrl: environment.chunkGatewayUrl,
      notificationServiceUrl: environment.notificationServiceUrl,
      agentServiceUrl: environment.agentServiceUrl,
      s3ApiUrl: environment.s3ApiUrl,
      outboxWorkerUrl: environment.outboxWorkerUrl
    };
  }

  // Check if all critical services are online
  areCriticalServicesOnline(): boolean {
    const criticalServices = ['Storage Control Plane', 'MCP Server', 'Chunk Gateway'];
    const currentStatus = this.getCurrentHealth();
    
    return criticalServices.every(serviceName => {
      const service = currentStatus.services.find(s => s.name === serviceName);
      return service?.status === 'online';
    });
  }

  // Get service configuration for UI components
  getServiceConfiguration(): any {
    return {
      storage: {
        apiUrl: environment.apiUrl,
        s3ApiUrl: environment.s3ApiUrl,
        chunkGatewayUrl: environment.chunkGatewayUrl
      },
      ai: {
        mcpUrl: environment.mcpUrl,
        agentServiceUrl: environment.agentServiceUrl
      },
      realtime: {
        websocketUrl: environment.websocketUrl,
        notificationServiceUrl: environment.notificationServiceUrl
      },
      background: {
        outboxWorkerUrl: environment.outboxWorkerUrl
      }
    };
  }
}
