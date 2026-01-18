import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { BackendIntegrationService } from './backend-integration.service';

export interface ObjectVersion {
  id: number;
  version: number;
  size: number;
  content_type: string;
  etag: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  manifest?: any;
  status: string;
  upload_id?: string;
  chunk_gateway_base_url?: string;
  token?: string;
  ttl_seconds?: number;
  is_current: boolean;
}

export interface VersionComparison {
  version1: ObjectVersion;
  version2: ObjectVersion;
  comparison: {
    size?: {
      version1: number;
      version2: number;
      change: number;
      change_percent: number;
    };
    content_type?: {
      version1: string;
      version2: string;
    };
    metadata?: Record<string, {
      version1: any;
      version2: any;
    }>;
    manifest?: {
      changed: boolean;
      version1_chunks: number;
      version2_chunks: number;
    };
  };
}

export interface VersionHistory {
  version: ObjectVersion;
  changes: {
    size_change?: number;
    content_type_changed?: boolean;
  };
  change_summary: string;
}

export interface VersionAnalytics {
  total_versions: number;
  size_evolution: Array<{
    version: number;
    size: number;
    created_at: string;
  }>;
  content_type_changes: Record<string, number>;
  version_frequency: {
    average_interval: number;
    min_interval: number;
    max_interval: number;
    total_versions: number;
    time_span: number;
  };
  storage_impact: {
    current_size: number;
    historical_size: number;
    total_storage_used: number;
    historical_percentage: number;
    version_count: number;
  };
}

export interface VersionListResponse {
  object_key: string;
  bucket_name: string;
  total_versions: number;
  versions: ObjectVersion[];
}

@Injectable({
  providedIn: 'root'
})
export class VersioningService {
  private apiUrl: string;

  constructor(private http: HttpClient, private backendIntegration: BackendIntegrationService) {
    const serviceUrls = this.backendIntegration.getServiceUrls();
    this.apiUrl = serviceUrls['apiUrl'];
  }

  // List all versions of an object
  getVersions(bucketName: string, objectKey: string): Observable<VersionListResponse> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.get<VersionListResponse>(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions`
    ).pipe(
      catchError((error: any) => {
        console.error('Error fetching versions:', error);
        return this.getEmptyVersionList(bucketName, objectKey);
      })
    );
  }

  // Get specific version details
  getVersion(bucketName: string, objectKey: string, versionId: number): Observable<ObjectVersion> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.get<ObjectVersion>(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/${versionId}`
    ).pipe(
      catchError((error: any) => {
        console.error('Error fetching version:', error);
        throw error;
      })
    );
  }

  // Restore object to specific version
  restoreVersion(bucketName: string, objectKey: string, versionId: number): Observable<any> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.post(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/${versionId}/restore`,
      {}
    ).pipe(
      catchError((error: any) => {
        console.error('Error restoring version:', error);
        throw error;
      })
    );
  }

  // Compare two versions
  compareVersions(
    bucketName: string,
    objectKey: string,
    version1Id: number,
    version2Id: number
  ): Observable<VersionComparison> {
    const encodedKey = encodeURIComponent(objectKey);
    const params = new URLSearchParams({
      version1_id: version1Id.toString(),
      version2_id: version2Id.toString()
    });

    return this.http.get<VersionComparison>(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/${version1Id}/compare?${params}`
    ).pipe(
      catchError((error: any) => {
        console.error('Error comparing versions:', error);
        throw error;
      })
    );
  }

  // Delete specific version
  deleteVersion(bucketName: string, objectKey: string, versionId: number): Observable<any> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.delete(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/${versionId}`
    ).pipe(
      catchError((error: any) => {
        console.error('Error deleting version:', error);
        throw error;
      })
    );
  }

  // Get version history with changes
  getVersionHistory(bucketName: string, objectKey: string): Observable<any> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.get(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/history`
    ).pipe(
      catchError((error: any) => {
        console.error('Error fetching version history:', error);
        return this.getEmptyVersionHistory(bucketName, objectKey);
      })
    );
  }

  // Create version tag/label
  tagVersion(
    bucketName: string,
    objectKey: string,
    versionId: number,
    tagName: string,
    tagDescription: string = ''
  ): Observable<any> {
    const encodedKey = encodeURIComponent(objectKey);
    const body = {
      tag_name: tagName,
      tag_description: tagDescription
    };

    return this.http.post(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/${versionId}/tag`,
      body
    ).pipe(
      catchError((error: any) => {
        console.error('Error tagging version:', error);
        throw error;
      })
    );
  }

  // Get version analytics
  getVersionAnalytics(bucketName: string, objectKey: string): Observable<VersionAnalytics> {
    const encodedKey = encodeURIComponent(objectKey);
    return this.http.get<VersionAnalytics>(
      `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodedKey}/versions/analytics`
    ).pipe(
      catchError((error: any) => {
        console.error('Error fetching version analytics:', error);
        return this.getEmptyVersionAnalytics();
      })
    );
  }

  // Helper methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  }

  getVersionStatusIcon(version: ObjectVersion): string {
    if (version.is_current) return '🟢';
    if (version.status === 'active') return '✅';
    if (version.status === 'pending') return '⏳';
    if (version.status === 'failed') return '❌';
    return '📋';
  }

  getChangeIcon(change: string): string {
    if (change.includes('increased')) return '📈';
    if (change.includes('decreased')) return '📉';
    if (change.includes('changed')) return '🔄';
    if (change.includes('updated')) return '✏️';
    if (change.includes('Initial')) return '🆕';
    return '📝';
  }

  canDeleteVersion(version: ObjectVersion, totalVersions: number): boolean {
    // Cannot delete current version or if it's the only version
    return !version.is_current && totalVersions > 1;
  }

  canRestoreVersion(version: ObjectVersion): boolean {
    // Can restore any version except current
    return !version.is_current;
  }

  getStorageTrend(analytics: VersionAnalytics): 'increasing' | 'decreasing' | 'stable' {
    const evolution = analytics.size_evolution;
    if (evolution.length < 2) return 'stable';
    
    const recent = evolution.slice(-3);
    const trend = recent[recent.length - 1].size - recent[0].size;
    
    if (Math.abs(trend) < evolution[0].size * 0.05) return 'stable';
    return trend > 0 ? 'increasing' : 'decreasing';
  }

  private getEmptyVersionList(bucketName: string, objectKey: string): Observable<VersionListResponse> {
    return of({
      object_key: objectKey,
      bucket_name: bucketName,
      total_versions: 0,
      versions: []
    });
  }

  private getEmptyVersionHistory(bucketName: string, objectKey: string): Observable<{
    object_key: string;
    bucket_name: string;
    history: VersionHistory[];
  }> {
    return of({
      object_key: objectKey,
      bucket_name: bucketName,
      history: []
    });
  }

  private getEmptyVersionAnalytics(): Observable<VersionAnalytics> {
    return of({
      total_versions: 0,
      size_evolution: [],
      content_type_changes: {},
      version_frequency: {
        average_interval: 0,
        min_interval: 0,
        max_interval: 0,
        total_versions: 0,
        time_span: 0
      },
      storage_impact: {
        current_size: 0,
        historical_size: 0,
        total_storage_used: 0,
        historical_percentage: 0,
        version_count: 0
      }
    });
  }
}
