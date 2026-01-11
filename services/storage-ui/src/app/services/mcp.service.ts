import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPResourceResult {
  contents: Array<{
    type: string;
    text: string;
  }>;
}

export interface StorageBucket {
  id: number;
  name: string;
  region: string;
  created_at: string;
}

export interface StorageObject {
  id: number;
  key: string;
  size?: number;
  content_type?: string;
  etag?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class McpService {
  private baseUrl = 'http://localhost:8080';
  private isConnected = new BehaviorSubject<boolean>(false);
  private availableTools = new BehaviorSubject<MCPTool[]>([]);
  private availableResources = new BehaviorSubject<MCPResource[]>([]);

  isConnected$ = this.isConnected.asObservable();
  availableTools$ = this.availableTools.asObservable();
  availableResources$ = this.availableResources.asObservable();

  constructor(private http: HttpClient) {
    this.initializeConnection();
  }

  private initializeConnection(): void {
    // Test connection to MCP server
    this.http.get(`${this.baseUrl}/health`).pipe(
      tap(() => this.isConnected.next(true)),
      catchError(() => {
        this.isConnected.next(false);
        return [];
      })
    ).subscribe();

    this.loadAvailableTools();
    this.loadAvailableResources();
  }

  private loadAvailableTools(): void {
    this.http.get<{ tools: MCPTool[] }>(`${this.baseUrl}/tools`).pipe(
      map(response => response.tools || []),
      tap(tools => this.availableTools.next(tools)),
      catchError(() => {
        this.availableTools.next([]);
        return [];
      })
    ).subscribe();
  }

  private loadAvailableResources(): void {
    this.http.get<{ resources: MCPResource[] }>(`${this.baseUrl}/resources`).pipe(
      map(response => response.resources || []),
      tap(resources => this.availableResources.next(resources)),
      catchError(() => {
        this.availableResources.next([]);
        return [];
      })
    ).subscribe();
  }

  // Storage operations via MCP
  listBuckets(): Observable<string[]> {
    return this.callTool('list_buckets', {}).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to list buckets');
        }
        const buckets = JSON.parse(result.content[0].text);
        return buckets.map((bucket: StorageBucket) => bucket.name);
      })
    );
  }

  createBucket(name: string, region: string = 'us-east-1'): Observable<string> {
    return this.callTool('create_bucket', { name, region }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to create bucket');
        }
        return result.content[0].text;
      })
    );
  }

  deleteBucket(name: string): Observable<string> {
    return this.callTool('delete_bucket', { name }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to delete bucket');
        }
        return result.content[0].text;
      })
    );
  }

  listObjects(bucket: string, prefix?: string): Observable<StorageObject[]> {
    const args: any = { bucket };
    if (prefix) {
      args.prefix = prefix;
    }

    return this.callTool('list_objects', args).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to list objects');
        }
        return JSON.parse(result.content[0].text);
      })
    );
  }

  getObjectInfo(bucket: string, key: string): Observable<any> {
    return this.callTool('get_object_info', { bucket, key }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to get object info');
        }
        return JSON.parse(result.content[0].text);
      })
    );
  }

  deleteObject(bucket: string, key: string): Observable<string> {
    return this.callTool('delete_object', { bucket, key }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to delete object');
        }
        return result.content[0].text;
      })
    );
  }

  getDownloadUrl(bucket: string, key: string): Observable<string> {
    return this.callTool('get_download_url', { bucket, key }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to get download URL');
        }
        const text = result.content[0].text;
        // Extract URL from text response
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        return urlMatch ? urlMatch[0] : text;
      })
    );
  }

  searchObjects(bucket: string, pattern: string, limit: number = 50): Observable<StorageObject[]> {
    return this.callTool('search_objects', { bucket, pattern, limit }).pipe(
      map(result => {
        if (result.isError) {
          throw new Error('Failed to search objects');
        }
        return JSON.parse(result.content[0].text);
      })
    );
  }

  // Generic MCP operations
  callTool(name: string, toolArgs: Record<string, any>): Observable<MCPToolResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<MCPToolResult>(`${this.baseUrl}/tools/${name}/call`, toolArgs, { headers }).pipe(
      catchError(error => {
        console.error('MCP Tool Call Error:', error);
        return [{
          content: [{ type: 'text', text: `Error: ${error.message || 'Unknown error'}` }],
          isError: true
        }];
      })
    );
  }

  getResource(uri: string): Observable<MCPResourceResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.get<MCPResourceResult>(`${this.baseUrl}/resources/${encodeURIComponent(uri)}`, { headers }).pipe(
      catchError(error => {
        console.error('MCP Get Resource Error:', error);
        return [{
          contents: [{ type: 'text', text: `Error: ${error.message || 'Unknown error'}` }]
        }];
      })
    );
  }

  // AI Assistant integration
  askAIAboutStorage(question: string, context?: any): Observable<string> {
    // This would integrate with an AI model that has access to MCP tools
    const prompt = `
      You are an AI assistant for a storage system. You have access to the following MCP tools:
      - list_buckets
      - create_bucket
      - delete_bucket
      - list_objects
      - get_object_info
      - delete_object
      - get_download_url
      - search_objects
      
      Context: ${context ? JSON.stringify(context, null, 2) : 'None'}
      
      User question: ${question}
      
      Please help the user with their storage-related question. Use the available tools to provide accurate information.
    `;

    // This would call an AI service with MCP tool access
    return new Observable(observer => {
      // Simulated AI response - in production, integrate with actual AI service
      setTimeout(() => {
        observer.next(`AI Response: Based on your question "${question}", I can help you with storage operations using the available MCP tools. Please use the interface above to perform specific actions.`);
        observer.complete();
      }, 1000);
    });
  }

  // Connection management
  reconnect(): void {
    this.initializeConnection();
  }

  getConnectionStatus(): boolean {
    return this.isConnected.value;
  }

  getToolByName(name: string): MCPTool | undefined {
    return this.availableTools.value.find(tool => tool.name === name);
  }

  getResourcesByType(type: string): MCPResource[] {
    return this.availableResources.value.filter(resource => 
      resource.uri.includes(type)
    );
  }
}
