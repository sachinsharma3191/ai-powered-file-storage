import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BackendIntegrationService } from './backend-integration.service';

export interface SearchFilters {
  content_type?: string[];
  size_min?: number;
  size_max?: number;
  date_from?: string;
  date_to?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: number;
  key: string;
  bucket_name: string;
  size: number;
  content_type: string;
  etag: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  similarity_score?: number;
}

export interface SearchResponse {
  query: string;
  filters: SearchFilters;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  results: SearchResult[];
  aggregations: {
    content_types: Array<{ type: string; count: number }>;
    size_ranges: {
      small: number;
      medium: number;
      large: number;
    };
    buckets: Array<{ bucket: string; count: number }>;
  };
}

export interface SemanticSearchResponse {
  query: string;
  threshold: number;
  results: SearchResult[];
  total: number;
}

export interface SearchSuggestion {
  type: 'prefix' | 'object';
  value: string;
}

export interface SearchAnalytics {
  timeframe: string;
  total_searches: number;
  unique_queries: number;
  top_queries: Array<{ query: string; count: number }>;
  search_trends: Array<{ date: string; searches: number }>;
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private apiUrl: string;

  constructor(
    private http: HttpClient,
    private backendIntegration: BackendIntegrationService
  ) {
    const serviceUrls = this.backendIntegration.getServiceUrls();
    this.apiUrl = serviceUrls['apiUrl'];
  }

  // Advanced search with filters
  search(
    query: string,
    bucketId?: string,
    filters?: SearchFilters,
    sortBy: string = 'created_at',
    sortOrder: string = 'desc',
    page: number = 1,
    perPage: number = 20
  ): Observable<SearchResponse> {
    let params = new HttpParams()
      .set('q', query)
      .set('sort_by', sortBy)
      .set('sort_order', sortOrder)
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    if (bucketId) {
      params = params.set('bucket_id', bucketId);
    }

    if (filters) {
      params = params.set('filters', JSON.stringify(filters));
    }

    return this.http.get<SearchResponse>(`${this.apiUrl}/api/v1/search`, { params }).pipe(
      catchError(error => {
        console.error('Search error:', error);
        return this.getEmptySearchResponse(query, filters);
      })
    );
  }

  // Semantic search using embeddings
  semanticSearch(
    query: string,
    bucketId?: string,
    threshold: number = 0.7
  ): Observable<SemanticSearchResponse> {
    let params = new HttpParams()
      .set('q', query)
      .set('threshold', threshold.toString());

    if (bucketId) {
      params = params.set('bucket_id', bucketId);
    }

    return this.http.get<SemanticSearchResponse>(`${this.apiUrl}/api/v1/search/semantic`, { params }).pipe(
      catchError(error => {
        console.error('Semantic search error:', error);
        return of({
          query,
          threshold,
          results: [],
          total: 0
        });
      })
    );
  }

  // Search suggestions/autocomplete
  getSuggestions(
    query: string,
    bucketId?: string,
    limit: number = 10
  ): Observable<SearchSuggestion[]> {
    if (query.length < 2) {
      return of([]);
    }

    let params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString());

    if (bucketId) {
      params = params.set('bucket_id', bucketId);
    }

    return this.http.get<{ suggestions: SearchSuggestion[] }>(`${this.apiUrl}/api/v1/search/suggestions`, { params }).pipe(
      map(response => response.suggestions),
      catchError(error => {
        console.error('Suggestions error:', error);
        return of([]);
      })
    );
  }

  // Search analytics
  getAnalytics(timeframe: string = '7d'): Observable<SearchAnalytics> {
    const params = new HttpParams().set('timeframe', timeframe);

    return this.http.get<SearchAnalytics>(`${this.apiUrl}/api/v1/search/analytics`, { params }).pipe(
      catchError(error => {
        console.error('Analytics error:', error);
        return this.getEmptyAnalytics();
      })
    );
  }

  // Create a search operator for auto-complete with debouncing
  createSearchOperator() {
    return (source$: Observable<string>) => source$.pipe(
      debounceTime(300),
      distinctUntilChanged()
    );
  }

  // Helper method to build search filters
  buildFilters(filters: Partial<SearchFilters>): SearchFilters {
    return {
      content_type: filters.content_type,
      size_min: filters.size_min,
      size_max: filters.size_max,
      date_from: filters.date_from,
      date_to: filters.date_to,
      tags: filters.tags,
      metadata: filters.metadata
    };
  }

  // Helper method to format file size
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Helper method to get content type icon
  getContentTypeIcon(contentType: string): string {
    if (contentType.startsWith('image/')) return '🖼️';
    if (contentType.startsWith('video/')) return '🎥';
    if (contentType.startsWith('audio/')) return '🎵';
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('word') || contentType.includes('document')) return '📝';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return '📊';
    if (contentType.includes('powerpoint') || contentType.includes('presentation')) return '📈';
    if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar')) return '🗜️';
    if (contentType.includes('text')) return '📃';
    if (contentType.includes('json')) return '📋';
    if (contentType.includes('xml')) return '🏷️';
    return '📎';
  }

  // Helper method to check if file is previewable
  isPreviewable(contentType: string): boolean {
    const previewableTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/json', 'application/xml'
    ];
    
    return previewableTypes.includes(contentType) || 
           contentType.startsWith('image/') ||
           contentType.startsWith('text/');
  }

  // Helper method to generate download URL
  getDownloadUrl(bucketName: string, key: string): string {
    return `${this.apiUrl}/api/v1/buckets/${bucketName}/objects/${encodeURIComponent(key)}/download-url`;
  }

  // Helper method to get relative time
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

  private getEmptySearchResponse(query: string, filters?: SearchFilters): Observable<SearchResponse> {
    return of({
      query,
      filters: filters || {},
      total: 0,
      page: 1,
      per_page: 20,
      total_pages: 0,
      results: [],
      aggregations: {
        content_types: [],
        size_ranges: { small: 0, medium: 0, large: 0 },
        buckets: []
      }
    });
  }

  private getEmptyAnalytics(): Observable<SearchAnalytics> {
    return of({
      timeframe: '7d',
      total_searches: 0,
      unique_queries: 0,
      top_queries: [],
      search_trends: []
    });
  }
}
