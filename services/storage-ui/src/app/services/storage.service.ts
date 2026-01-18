import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BackendIntegrationService } from './backend-integration.service';

export interface Bucket {
  id: number;
  name: string;
  region: string;
  versioning: string;
  default_encryption: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  lifecycleEnabled?: boolean;
  lifecycleRules?: number;
}

export interface StorageObject {
  id: number;
  key: string;
  size?: number;
  content_type?: string;
  etag?: string;
  storage_class?: string;
  created_at: string;
  updated_at: string;
  current_version?: {
    id: number;
    version_id: string;
    size: number;
    etag: string;
    status: string;
  };
}

export interface ListObjectsResponse {
  bucket: string;
  objects: StorageObject[];
  common_prefixes?: string[];
  delimiter?: string;
  prefix?: string;
  cursor?: string;
  has_more: boolean;
}

export interface LifecycleRule {
  id: string;
  action: 'expire' | 'transition' | 'delete';
  days: number;
  prefix?: string;
  storage_class?: string;
  enabled: boolean;
}

export interface LifecyclePolicy {
  id: number;
  bucket_id: number;
  enabled: boolean;
  rules: LifecycleRule[];
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface CreateObjectResponse {
  object: StorageObject;
  version: {
    id: number;
    version_id: string;
  };
  chunk_gateway_base_url: string;
  token: string;
  ttl_seconds: number;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(
    private http: HttpClient,
    private backendIntegration: BackendIntegrationService
  ) {
    // Use backend integration for service discovery
    this.serviceUrls = this.backendIntegration.getServiceUrls();
  }

  private serviceUrls: Record<string, string>;

  listBuckets(): Observable<Bucket[]> {
    return this.http.get<{buckets: Bucket[]}>('/api/v1/buckets').pipe(
      map(response => response.buckets)
    );
  }

  createBucket(name: string, region: string): Observable<Bucket> {
    return this.http.post<Bucket>('/api/v1/buckets', { name, region });
  }

  deleteBucket(name: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/buckets/${name}`);
  }

  listObjects(bucketName: string, options?: {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}): Observable<ListObjectsResponse> {
    const params = new URLSearchParams();
    if (options?.prefix) params.set('prefix', options.prefix);
    if (options?.delimiter) params.set('delimiter', options.delimiter);
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.limit) params.set('limit', options.limit.toString());
    
    const url = `${this.serviceUrls['apiUrl']}/api/v1/buckets/${bucketName}/objects${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get<ListObjectsResponse>(url);
  }

  createObject(bucketName: string, key: string): Observable<CreateObjectResponse> {
    return this.http.post<CreateObjectResponse>(`${this.serviceUrls['apiUrl']}/api/v1/buckets/${bucketName}/objects`, { key });
  }

  deleteObject(bucketName: string, key: string): Observable<void> {
    return this.http.delete<void>(`${this.serviceUrls['apiUrl']}/api/v1/buckets/${bucketName}/objects/${encodeURIComponent(key)}`);
  }

  uploadToChunkGateway(gatewayUrl: string, token: string, data: ArrayBuffer): Observable<{ etag: string; rateLimit?: RateLimitInfo | null }> {
    return this.http.put<{ etag: string; rateLimit?: RateLimitInfo | null }>(gatewayUrl, data, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      observe: 'response'
    }).pipe(
      map((response: any) => ({
        etag: response.body?.etag || '',
        rateLimit: this.extractRateLimitInfo(response.headers)
      }))
    );
  }

  completeUpload(bucketName: string, key: string, versionId: string, etag: string, size: number): Observable<StorageObject> {
    return this.http.post<StorageObject>(
      `/api/v1/buckets/${bucketName}/objects/${encodeURIComponent(key)}/complete`,
      { version_id: versionId, etag, size }
    );
  }

  // Lifecycle Policy Methods
  getLifecyclePolicy(bucketName: string): Observable<LifecyclePolicy> {
    return this.http.get<LifecyclePolicy>(`/api/v1/buckets/${bucketName}/lifecycle`);
  }

  setLifecyclePolicy(bucketName: string, policy: LifecyclePolicy): Observable<LifecyclePolicy> {
    return this.http.put<LifecyclePolicy>(`/api/v1/buckets/${bucketName}/lifecycle`, policy);
  }

  deleteLifecyclePolicy(bucketName: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/buckets/${bucketName}/lifecycle`);
  }

  // Rate Limit Helper
  private extractRateLimitInfo(headers: any): RateLimitInfo | null {
    if (!headers) return null;
    
    return {
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      reset: parseInt(headers.get('X-RateLimit-Reset') || '0')
    };
  }
}
