import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StorageService, Bucket, StorageObject, ListObjectsResponse, LifecyclePolicy, LifecycleRule, RateLimitInfo } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let httpMock: HttpTestingController;

  const mockBucket: Bucket = {
    id: 1,
    name: 'test-bucket',
    region: 'us-west-2',
    versioning: 'enabled',
    default_encryption: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  const mockStorageObject: StorageObject = {
    id: 1,
    key: 'test-file.txt',
    size: 1024,
    content_type: 'text/plain',
    etag: 'abc123',
    storage_class: 'standard',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version_id: 'v1',
    is_latest: true,
    is_delete_marker: false
  };

  const mockListObjectsResponse: ListObjectsResponse = {
    objects: [mockStorageObject],
    common_prefixes: ['folder/'],
    cursor: 'next-cursor',
    has_more: true
  };

  const mockLifecyclePolicy: LifecyclePolicy = {
    id: 1,
    bucket_id: 1,
    enabled: true,
    rules: [{
      id: 'rule1',
      action: 'expire',
      days: 30,
      enabled: true
    }]
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StorageService]
    });
    service = TestBed.inject(StorageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Bucket Operations', () => {
    it('should list buckets', () => {
      const mockBuckets = [mockBucket];

      service.listBuckets().subscribe(buckets => {
        expect(buckets).toEqual(mockBuckets);
      });

      const req = httpMock.expectOne('/api/v1/buckets');
      expect(req.request.method).toBe('GET');
      req.flush(mockBuckets);
    });

    it('should create bucket', () => {
      service.createBucket('new-bucket', 'us-east-1').subscribe(bucket => {
        expect(bucket).toEqual(mockBucket);
      });

      const req = httpMock.expectOne('/api/v1/buckets');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'new-bucket', region: 'us-east-1' });
      req.flush(mockBucket);
    });

    it('should delete bucket', () => {
      service.deleteBucket('test-bucket').subscribe();

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket');
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });

    it('should get bucket details', () => {
      service.getBucket('test-bucket').subscribe(bucket => {
        expect(bucket).toEqual(mockBucket);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket');
      expect(req.request.method).toBe('GET');
      req.flush(mockBucket);
    });
  });

  describe('Object Operations', () => {
    it('should list objects with options', () => {
      const options = {
        prefix: 'folder/',
        delimiter: '/',
        cursor: 'cursor',
        limit: 100
      };

      service.listObjects('test-bucket', options).subscribe(response => {
        expect(response).toEqual(mockListObjectsResponse);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects?prefix=folder%2F&delimiter=%2F&cursor=cursor&limit=100');
      expect(req.request.method).toBe('GET');
      req.flush(mockListObjectsResponse);
    });

    it('should list objects without options', () => {
      service.listObjects('test-bucket').subscribe(response => {
        expect(response).toEqual(mockListObjectsResponse);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects');
      expect(req.request.method).toBe('GET');
      req.flush(mockListObjectsResponse);
    });

    it('should create object', () => {
      const createResponse = { upload_url: 'http://example.com/upload', version_id: 'v1' };

      service.createObject('test-bucket', 'test-file.txt').subscribe(response => {
        expect(response).toEqual(createResponse);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ key: 'test-file.txt' });
      req.flush(createResponse);
    });

    it('should delete object', () => {
      service.deleteObject('test-bucket', 'test-file.txt').subscribe();

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/test-file.txt');
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });

    it('should get object details', () => {
      service.getObject('test-bucket', 'test-file.txt').subscribe(obj => {
        expect(obj).toEqual(mockStorageObject);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/test-file.txt');
      expect(req.request.method).toBe('GET');
      req.flush(mockStorageObject);
    });

    it('should get download URL', () => {
      const downloadResponse = { download_url: 'http://example.com/download', expires_in: 3600 };

      service.getDownloadUrl('test-bucket', 'test-file.txt').subscribe(response => {
        expect(response).toEqual(downloadResponse);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/test-file.txt/download-url');
      expect(req.request.method).toBe('POST');
      req.flush(downloadResponse);
    });

    it('should complete upload', () => {
      service.completeUpload('test-bucket', 'test-file.txt', 'v1', 'abc123', 1024).subscribe(obj => {
        expect(obj).toEqual(mockStorageObject);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/test-file.txt/complete');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ version_id: 'v1', etag: 'abc123', size: 1024 });
      req.flush(mockStorageObject);
    });
  });

  describe('Lifecycle Policy Operations', () => {
    it('should get lifecycle policy', () => {
      service.getLifecyclePolicy('test-bucket').subscribe(policy => {
        expect(policy).toEqual(mockLifecyclePolicy);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/lifecycle');
      expect(req.request.method).toBe('GET');
      req.flush(mockLifecyclePolicy);
    });

    it('should set lifecycle policy', () => {
      service.setLifecyclePolicy('test-bucket', mockLifecyclePolicy).subscribe(policy => {
        expect(policy).toEqual(mockLifecyclePolicy);
      });

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/lifecycle');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ policy: mockLifecyclePolicy });
      req.flush(mockLifecyclePolicy);
    });

    it('should delete lifecycle policy', () => {
      service.deleteLifecyclePolicy('test-bucket').subscribe();

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/lifecycle');
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Chunk Gateway Operations', () => {
    it('should upload to chunk gateway with rate limit info', () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        body: { etag: 'new-etag' },
        headers: {
          get: (key: string) => {
            if (key === 'X-RateLimit-Limit') return '1000';
            if (key === 'X-RateLimit-Remaining') return '950';
            if (key === 'X-RateLimit-Reset') return '300';
            return null;
          }
        }
      };

      service.uploadToChunkGateway('http://chunk-gateway:4000/upload', 'token', mockArrayBuffer).subscribe(response => {
        expect(response.etag).toBe('new-etag');
        expect(response.rateLimit).toEqual({
          limit: 1000,
          remaining: 950,
          reset: 300
        });
      });

      const req = httpMock.expectOne('http://chunk-gateway:4000/upload');
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('Authorization')).toBe('Bearer token');
      expect(req.request.headers.get('Content-Type')).toBe('application/octet-stream');
      req.flush(mockResponse.body, { headers: mockResponse.headers });
    });

    it('should handle chunk gateway upload without rate limit headers', () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        body: { etag: 'new-etag' },
        headers: {
          get: () => null
        }
      };

      service.uploadToChunkGateway('http://chunk-gateway:4000/upload', 'token', mockArrayBuffer).subscribe(response => {
        expect(response.etag).toBe('new-etag');
        expect(response.rateLimit).toBeNull();
      });

      const req = httpMock.expectOne('http://chunk-gateway:4000/upload');
      req.flush(mockResponse.body, { headers: mockResponse.headers });
    });
  });

  describe('Rate Limit Helper', () => {
    it('should extract rate limit info from headers', () => {
      const headers = {
        get: (key: string) => {
          if (key === 'X-RateLimit-Limit') return '1000';
          if (key === 'X-RateLimit-Remaining') return '850';
          if (key === 'X-RateLimit-Reset') return '150';
          return null;
        }
      };

      // Access private method through type assertion
      const serviceAny = service as any;
      const result = serviceAny.extractRateLimitInfo(headers);

      expect(result).toEqual({
        limit: 1000,
        remaining: 850,
        reset: 150
      });
    });

    it('should handle null headers', () => {
      const serviceAny = service as any;
      const result = serviceAny.extractRateLimitInfo(null);

      expect(result).toBeNull();
    });

    it('should handle missing rate limit headers', () => {
      const headers = {
        get: () => null
      };

      const serviceAny = service as any;
      const result = serviceAny.extractRateLimitInfo(headers);

      expect(result).toEqual({
        limit: 0,
        remaining: 0,
        reset: 0
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors gracefully', () => {
      service.listBuckets().subscribe({
        next: () => fail('Should have failed'),
        error: (error) => {
          expect(error).toBeTruthy();
        }
      });

      const req = httpMock.expectOne('/api/v1/buckets');
      req.flush('Server Error', { status: 500, statusText: 'Server Error' });
    });

    it('should handle network errors', () => {
      service.listBuckets().subscribe({
        next: () => fail('Should have failed'),
        error: (error) => {
          expect(error).toBeTruthy();
        }
      });

      const req = httpMock.expectOne('/api/v1/buckets');
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('URL Encoding', () => {
    it('should properly encode object keys with special characters', () => {
      service.deleteObject('test-bucket', 'folder/file with spaces.txt').subscribe();

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/folder%2Ffile%20with%20spaces.txt');
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });

    it('should properly encode object keys with slashes', () => {
      service.getObject('test-bucket', 'path/to/file.txt').subscribe();

      const req = httpMock.expectOne('/api/v1/buckets/test-bucket/objects/path%2Fto%2Ffile.txt');
      expect(req.request.method).toBe('GET');
      req.flush(mockStorageObject);
    });
  });
});
