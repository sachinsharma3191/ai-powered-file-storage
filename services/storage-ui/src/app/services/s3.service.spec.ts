import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { S3Service, S3Bucket, S3Object } from './s3.service';

describe('S3Service', () => {
  let service: S3Service;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000';

  const mockBuckets: S3Bucket[] = [
    {
      Name: 'test-bucket-1',
      CreationDate: '2024-01-01T00:00:00Z'
    },
    {
      Name: 'test-bucket-2',
      CreationDate: '2024-01-02T00:00:00Z'
    }
  ];

  const mockObjects: S3Object[] = [
    {
      Key: 'folder1/file1.txt',
      LastModified: '2024-01-01T00:00:00Z',
      ETag: '"test-etag-1"',
      Size: 1024,
      StorageClass: 'STANDARD',
      Owner: {
        ID: 'owner-id',
        DisplayName: 'owner'
      }
    },
    {
      Key: 'folder1/file2.pdf',
      LastModified: '2024-01-02T00:00:00Z',
      ETag: '"test-etag-2"',
      Size: 2048,
      StorageClass: 'STANDARD',
      Owner: {
        ID: 'owner-id',
        DisplayName: 'owner'
      }
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [S3Service]
    });

    service = TestBed.inject(S3Service);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Bucket Operations', () => {
    it('should list buckets', () => {
      service.listBuckets().subscribe(buckets => {
        expect(buckets).toEqual(mockBuckets);
      });

      const req = httpMock.expectOne(`${baseUrl}/s3`);
      expect(req.request.method).toBe('GET');
      req.flush({ buckets: mockBuckets });
    });

    it('should create bucket', () => {
      const bucketName = 'new-bucket';

      service.createBucket(bucketName).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}`);
      expect(req.request.method).toBe('PUT');
      req.flush({});
    });

    it('should delete bucket', () => {
      const bucketName = 'test-bucket';

      service.deleteBucket(bucketName).subscribe(response => {
        expect(response).toBeUndefined();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Object Operations', () => {
    const bucketName = 'test-bucket';

    it('should head object', () => {
      const objectKey = 'folder1/file1.txt';
      const headers = new HttpHeaders().set('ETag', '"test-etag"');

      service.headObject(bucketName, objectKey).subscribe(response => {
        expect(response.get('ETag')).toBe('"test-etag"');
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}`);
      expect(req.request.method).toBe('HEAD');
      req.flush('', { headers });
    });

    it('should get object', () => {
      const objectKey = 'folder1/file1.txt';
      const blob = new Blob(['test content']);

      service.getObject(bucketName, objectKey).subscribe(response => {
        expect(response).toEqual(blob);
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}`);
      expect(req.request.method).toBe('GET');
      req.flush(blob);
    });

    it('should put object', () => {
      const objectKey = 'folder1/new-file.txt';
      const file = new File(['test content'], 'test.txt');

      service.putObject(bucketName, objectKey, file).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBe(file);
      req.flush({});
    });

    it('should put object with metadata', () => {
      const objectKey = 'folder1/new-file.txt';
      const file = new File(['test content'], 'test.txt');
      const metadata = { 'custom-key': 'custom-value' };

      service.putObject(bucketName, objectKey, file, metadata).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('custom-key')).toBe('custom-value');
      req.flush({});
    });

    it('should delete object', () => {
      const objectKey = 'folder1/file1.txt';

      service.deleteObject(bucketName, objectKey).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Multipart Upload Operations', () => {
    const bucketName = 'test-bucket';
    const objectKey = 'large-file.zip';

    it('should initiate multipart upload', () => {
      const uploadId = 'upload123';

      service.initiateMultipartUpload(bucketName, objectKey).subscribe(response => {
        expect(response).toBe(uploadId);
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}?uploads`);
      expect(req.request.method).toBe('POST');
      req.flush({ upload_id: uploadId });
    });

    it('should initiate multipart upload with content type', () => {
      const uploadId = 'upload123';
      const contentType = 'application/zip';

      service.initiateMultipartUpload(bucketName, objectKey, contentType).subscribe(response => {
        expect(response).toBe(uploadId);
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}?uploads`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe(contentType);
      req.flush({ upload_id: uploadId });
    });

    it('should upload part', () => {
      const uploadId = 'upload123';
      const partNumber = 1;
      const data = new Blob(['test content']);
      const etag = '"part-etag"';

      service.uploadPart(bucketName, objectKey, uploadId, partNumber, data).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}?partNumber=${partNumber}&uploadId=${uploadId}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBe(data);
      req.flush({ etag });
    });

    it('should complete multipart upload', () => {
      const uploadId = 'upload123';
      const parts = [{ ETag: '"part-etag"', PartNumber: 1 }];

      service.completeMultipartUpload(bucketName, objectKey, uploadId, parts).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}?uploadId=${uploadId}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ parts });
      req.flush({ key: objectKey });
    });

    it('should abort multipart upload', () => {
      const uploadId = 'upload123';

      service.abortMultipartUpload(bucketName, objectKey, uploadId).subscribe(response => {
        expect(response).toBeUndefined();
      });

      const req = httpMock.expectOne(`${baseUrl}/s3/${bucketName}/${objectKey}?uploadId=${uploadId}`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors gracefully', () => {
      const errorMessage = 'Bucket not found';

      service.listBuckets().subscribe(
        () => fail('Should have failed'),
        error => {
          expect(error.status).toBe(404);
          expect(error.error).toBe(errorMessage);
        }
      );

      const req = httpMock.expectOne(`${baseUrl}/s3`);
      req.flush(errorMessage, { status: 404, statusText: 'Not Found' });
    });

    it('should handle network errors', () => {
      service.listBuckets().subscribe(
        () => fail('Should have failed'),
        error => {
          expect(error).toBeTruthy();
        }
      );

      const req = httpMock.expectOne(`${baseUrl}/s3`);
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('Helper Methods', () => {
    it('should generate auth header correctly', () => {
      const accessKey = 'test-access-key';
      const secretKey = 'test-secret-key';
      
      // Test the private method through public API
      service.listBuckets().subscribe();
      
      const req = httpMock.expectOne(`${baseUrl}/s3`);
      expect(req.request.headers.get('Authorization')).toBeTruthy();
      req.flush({ buckets: [] });
    });

    it('should include custom headers in requests', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      
      service.putObject('bucket', 'key', file).subscribe();
      
      const req = httpMock.expectOne(`${baseUrl}/s3/bucket/key`);
      expect(req.request.headers.get('Content-Type')).toBe('text/plain');
      req.flush({});
    });
  });

  describe('XML Parsing', () => {
    it('should parse bucket list XML response', () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <ListAllMyBucketsResult>
          <Buckets>
            <Bucket>
              <Name>test-bucket</Name>
              <CreationDate>2024-01-01T00:00:00Z</CreationDate>
            </Bucket>
          </Buckets>
        </ListAllMyBucketsResult>`;

      service.listBuckets().subscribe(buckets => {
        expect(buckets.length).toBe(1);
        expect(buckets[0].Name).toBe('test-bucket');
      });

      const req = httpMock.expectOne(`${baseUrl}/s3`);
      req.flush(xmlResponse, { headers: { 'Content-Type': 'application/xml' } });
    });

    it('should parse object list XML response', () => {
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <Contents>
            <Key>test-file.txt</Key>
            <LastModified>2024-01-01T00:00:00Z</LastModified>
            <ETag>"test-etag"</ETag>
            <Size>1024</Size>
            <StorageClass>STANDARD</StorageClass>
          </Contents>
        </ListBucketResult>`;

      service.headObject('bucket', 'key').subscribe();
      
      const req = httpMock.expectOne(`${baseUrl}/s3/bucket/key`);
      req.flush(xmlResponse, { headers: { 'Content-Type': 'application/xml' } });
    });
  });
});
