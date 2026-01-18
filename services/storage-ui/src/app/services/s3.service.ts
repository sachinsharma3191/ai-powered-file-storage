import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { BackendIntegrationService } from './backend-integration.service';

export interface S3Bucket {
  Name: string;
  CreationDate: string;
}

export interface S3Object {
  Key: string;
  LastModified: string;
  ETag: string;
  Size: number;
  StorageClass: string;
  Owner: {
    ID: string;
    DisplayName: string;
  };
}

export interface S3ListBucketsResponse {
  ListAllMyBucketsResult: {
    Owner: {
      ID: string;
      DisplayName: string;
    };
    Buckets: {
      Bucket: S3Bucket;
    }[];
  };
}

export interface S3ListObjectsResponse {
  ListBucketResult: {
    Name: string;
    Prefix?: string;
    Marker?: string;
    MaxKeys: number;
    IsTruncated: boolean;
    NextMarker?: string;
    Contents: S3Object[];
    CommonPrefixes?: {
      Prefix: string;
    }[];
  };
}

export interface S3InitiateMultipartResponse {
  InitiateMultipartUploadResult: {
    Bucket: string;
    Key: string;
    UploadId: string;
  };
}

export interface S3CompleteMultipartResponse {
  CompleteMultipartUploadResult: {
    Location: string;
    Bucket: string;
    Key: string;
    ETag: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class S3Service {
  private baseUrl: string;
  
  constructor(
    private http: HttpClient,
    private backendIntegration: BackendIntegrationService
  ) {
    // Use backend integration for service discovery
    const serviceUrls = this.backendIntegration.getServiceUrls();
    this.baseUrl = serviceUrls['s3ApiUrl'];
  }

  private getHeaders(): HttpHeaders {
    // Get credentials from storage or environment
    const accessKey = localStorage.getItem('aws_access_key_id') || '';
    const secretKey = localStorage.getItem('aws_secret_access_key') || '';
    
    return new HttpHeaders({
      'Content-Type': 'application/xml',
      'Authorization': this.generateAuthHeader(accessKey, secretKey)
    });
  }

  private generateAuthHeader(accessKey: string, secretKey: string): string {
    // Simplified auth header - in production, implement full AWS Signature V4
    return `AWS4-HMAC-SHA256 Credential=${accessKey}/20240101/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=placeholder`;
  }

  listBuckets(): Observable<S3Bucket[]> {
    return this.http.get(this.baseUrl + '/', { 
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      map(response => this.parseXmlListBuckets(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  listObjects(bucketName: string, options?: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    marker?: string;
  }): Observable<S3Object[]> {
    let params = new HttpParams();
    
    if (options?.prefix) params = params.set('prefix', options.prefix);
    if (options?.delimiter) params = params.set('delimiter', options.delimiter);
    if (options?.maxKeys) params = params.set('max-keys', options.maxKeys.toString());
    if (options?.marker) params = params.set('marker', options.marker);

    return this.http.get(`${this.baseUrl}/${bucketName}`, { 
      headers: this.getHeaders(),
      params,
      responseType: 'text'
    }).pipe(
      map(response => this.parseXmlListObjects(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  headObject(bucketName: string, key: string): Observable<HttpHeaders> {
    return this.http.head(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}`, { 
      headers: this.getHeaders(),
      observe: 'response'
    }).pipe(
      map(response => response.headers),
      catchError(error => this.handleError(error))
    );
  }

  getObject(bucketName: string, key: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}`, { 
      headers: this.getHeaders(),
      responseType: 'blob'
    }).pipe(
      catchError(error => this.handleError(error))
    );
  }

  putObject(bucketName: string, key: string, file: File, metadata?: Record<string, string>): Observable<any> {
    let headers = this.getHeaders();
    
    if (file.type) {
      headers = headers.set('Content-Type', file.type);
    }
    
    // Add custom metadata
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        headers = headers.set(`x-amz-meta-${key}`, value);
      });
    }

    return this.http.put(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}`, file, { 
      headers,
      responseType: 'text'
    }).pipe(
      map(response => this.parseXmlResponse(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  deleteObject(bucketName: string, key: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}`, { 
      headers: this.getHeaders(),
      responseType: 'text'
    }).pipe(
      map(response => this.parseXmlResponse(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  initiateMultipartUpload(bucketName: string, key: string, contentType?: string): Observable<string> {
    let headers = this.getHeaders();
    if (contentType) {
      headers = headers.set('Content-Type', contentType);
    }

    return this.http.post(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}?uploads=`, '', { 
      headers,
      responseType: 'text'
    }).pipe(
      map(response => this.parseXmlInitiateMultipart(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  uploadPart(bucketName: string, key: string, uploadId: string, partNumber: number, data: Blob): Observable<any> {
    const headers = this.getHeaders().set('Content-Type', 'application/octet-stream');
    
    return this.http.put(
      `${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}?partNumber=${partNumber}&uploadId=${uploadId}`, 
      data, 
      { headers, responseType: 'text' }
    ).pipe(
      map(response => this.parseXmlResponse(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  completeMultipartUpload(bucketName: string, key: string, uploadId: string, parts: Array<{ETag: string, PartNumber: number}>): Observable<any> {
    const headers = this.getHeaders().set('Content-Type', 'application/xml');
    
    const partsXml = parts.map(part => 
      `<Part><ETag>${part.ETag}</ETag><PartNumber>${part.PartNumber}</PartNumber></Part>`
    ).join('');
    
    const body = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

    return this.http.post(
      `${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}?uploadId=${uploadId}`, 
      body, 
      { headers, responseType: 'text' }
    ).pipe(
      map(response => this.parseXmlCompleteMultipart(response as string)),
      catchError(error => this.handleError(error))
    );
  }

  abortMultipartUpload(bucketName: string, key: string, uploadId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${bucketName}/${encodeURIComponent(key)}?uploadId=${uploadId}`, { headers: this.getHeaders() })
    .pipe(
      catchError(error => this.handleError(error))
    );
  }

  createBucket(bucketName: string, region?: string): Observable<any> {
    const body = region ? `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${region}</LocationConstraint></CreateBucketConfiguration>` : '';
    return this.http.put<any>(`${this.baseUrl}/${bucketName}`, body, { headers: this.getHeaders() })
    .pipe(
      catchError(error => this.handleError(error))
    );
  }

  deleteBucket(bucketName: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${bucketName}`, { headers: this.getHeaders() })
    .pipe(
      catchError(error => this.handleError(error))
    );
  }

  private parseXmlListBuckets(xml: string): S3Bucket[] {
    // Simple XML parsing - in production, use proper XML parser
    const buckets: S3Bucket[] = [];
    const bucketMatches = xml.match(/<Bucket>(.*?)<\/Bucket>/gs) || [];
    
    bucketMatches.forEach(bucketXml => {
      const nameMatch = bucketXml.match(/<Name>(.*?)<\/Name>/);
      const dateMatch = bucketXml.match(/<CreationDate>(.*?)<\/CreationDate>/);
      
      if (nameMatch && dateMatch) {
        buckets.push({
          Name: nameMatch[1],
          CreationDate: dateMatch[1]
        });
      }
    });
    
    return buckets;
  }

  private parseXmlListObjects(xml: string): S3Object[] {
    const objects: S3Object[] = [];
    const contentMatches = xml.match(/<Contents>(.*?)<\/Contents>/gs) || [];
    
    contentMatches.forEach(contentXml => {
      const keyMatch = contentXml.match(/<Key>(.*?)<\/Key>/);
      const lastModifiedMatch = contentXml.match(/<LastModified>(.*?)<\/LastModified>/);
      const etagMatch = contentXml.match(/<ETag>(.*?)<\/ETag>/);
      const sizeMatch = contentXml.match(/<Size>(\d+)<\/Size>/);
      const storageClassMatch = contentXml.match(/<StorageClass>(.*?)<\/StorageClass>/);
      
      if (keyMatch && lastModifiedMatch && etagMatch && sizeMatch && storageClassMatch) {
        objects.push({
          Key: keyMatch[1],
          LastModified: lastModifiedMatch[1],
          ETag: etagMatch[1].replace(/"/g, ''),
          Size: parseInt(sizeMatch[1]),
          StorageClass: storageClassMatch[1],
          Owner: {
            ID: '',
            DisplayName: ''
          }
        });
      }
    });
    
    return objects;
  }

  private parseXmlInitiateMultipart(xml: string): string {
    const uploadIdMatch = xml.match(/<UploadId>(.*?)<\/UploadId>/);
    return uploadIdMatch ? uploadIdMatch[1] : '';
  }

  private parseXmlCompleteMultipart(xml: string): any {
    const locationMatch = xml.match(/<Location>(.*?)<\/Location>/);
    const etagMatch = xml.match(/<ETag>(.*?)<\/ETag>/);
    
    return {
      location: locationMatch ? locationMatch[1] : '',
      etag: etagMatch ? etagMatch[1].replace(/"/g, '') : ''
    };
  }

  private parseXmlResponse(xml: string): any {
    // Generic XML response parser
    return { message: 'Success', xml };
  }

  private handleError(error: any): Observable<never> {
    console.error('S3 API Error:', error);
    return throwError(() => error);
  }
}
