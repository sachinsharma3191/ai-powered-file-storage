import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Bucket {
  id: number;
  name: string;
  region: string;
  versioning: string;
  default_encryption: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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
  constructor(private http: HttpClient) {}

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

  listObjects(bucketName: string): Observable<StorageObject[]> {
    return this.http.get<{objects: StorageObject[]}>(`/api/v1/buckets/${bucketName}/objects`).pipe(
      map(response => response.objects)
    );
  }

  createObject(bucketName: string, key: string): Observable<CreateObjectResponse> {
    return this.http.post<CreateObjectResponse>(`/api/v1/buckets/${bucketName}/objects`, { key });
  }

  deleteObject(bucketName: string, key: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/buckets/${bucketName}/objects/${encodeURIComponent(key)}`);
  }

  uploadToChunkGateway(gatewayUrl: string, token: string, data: ArrayBuffer): Observable<{ etag: string }> {
    return this.http.put<{ etag: string }>(gatewayUrl, data, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      }
    });
  }

  completeUpload(bucketName: string, key: string, versionId: string, etag: string, size: number): Observable<StorageObject> {
    return this.http.post<StorageObject>(
      `/api/v1/buckets/${bucketName}/objects/${encodeURIComponent(key)}/complete`,
      { version_id: versionId, etag, size }
    );
  }
}
