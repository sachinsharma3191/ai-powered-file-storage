import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { BucketObjectsComponent } from './bucket-objects.component';
import { StorageService, ListObjectsResponse, StorageObject, RateLimitInfo } from '../../services/storage.service';
import { FileSecurityService, FileSecurityResult } from '../../services/file-security.service';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { CommonModule } from '@angular/common';

describe('BucketObjectsComponent', () => {
  let component: BucketObjectsComponent;
  let fixture: ComponentFixture<BucketObjectsComponent>;
  let mockStorageService: jasmine.SpyObj<StorageService>;
  let mockFileSecurityService: jasmine.SpyObj<FileSecurityService>;
  let mockActivatedRoute: jasmine.SpyObj<ActivatedRoute>;
  let mockRouter: jasmine.SpyObj<Router>;
  let destroySubject: Subject<void>;

  const mockStorageObject: StorageObject = {
    id: 1,
    key: 'test-file.txt',
    size: 1024,
    content_type: 'text/plain',
    etag: 'abc123',
    storage_class: 'standard',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  const mockListObjectsResponse: ListObjectsResponse = {
    bucket: 'test-bucket',
    objects: [mockStorageObject],
    common_prefixes: ['folder/', 'documents/'],
    cursor: 'next-cursor',
    has_more: true
  };

  const mockRateLimitInfo: RateLimitInfo = {
    limit: 1000,
    remaining: 850,
    reset: 300
  };

  beforeEach(async () => {
    destroySubject = new Subject<void>();
    
    const storageSpy = jasmine.createSpyObj('StorageService', ['listObjects', 'createObject']);
    const routeSpy = jasmine.createSpyObj('ActivatedRoute', ['params']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const fileSecuritySpy = jasmine.createSpyObj('FileSecurityService', ['validateFile', 'getAllowedExtensions', 'getMaxFileSize', 'getSecurityRules']);

    await TestBed.configureTestingModule({
      declarations: [BucketObjectsComponent],
      providers: [
        { provide: StorageService, useValue: storageSpy },
        { provide: ActivatedRoute, useValue: routeSpy },
        { provide: Router, useValue: routerSpy },
        { provide: FileSecurityService, useValue: fileSecuritySpy }
      ]
    }).compileComponents();

    mockStorageService = TestBed.inject(StorageService) as jasmine.SpyObj<StorageService>;
    mockActivatedRoute = TestBed.inject(ActivatedRoute) as jasmine.SpyObj<ActivatedRoute>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    mockFileSecurityService = TestBed.inject(FileSecurityService) as jasmine.SpyObj<FileSecurityService>;

    fixture = TestBed.createComponent(BucketObjectsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    destroySubject.next();
    destroySubject.complete();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with bucket name and path from route params', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket',
        path: 'folder/subfolder'
      });

      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      fixture.detectChanges();

      expect(component.bucketName).toBe('test-bucket');
      expect(component.currentPath).toBe('folder/subfolder');
      expect(component.pathParts).toEqual(['folder', 'subfolder']);
    });

    it('should handle empty path in route params', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      fixture.detectChanges();

      expect(component.currentPath).toBe('');
      expect(component.pathParts).toEqual([]);
    });

    it('should load objects on initialization', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      fixture.detectChanges();

      expect(mockStorageService.listObjects).toHaveBeenCalledWith('test-bucket', {
        prefix: '',
        delimiter: '/',
        cursor: undefined,
        limit: 100
      });
      expect(component.objects).toEqual([mockStorageObject]);
      expect(component.folders).toEqual(['folder/', 'documents/']);
      expect(component.hasMore).toBe(true);
      expect(component.cursor).toBe('next-cursor');
    });

    it('should handle loading errors gracefully', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.listObjects.and.returnValue(throwError('API Error'));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.loadingMore).toBe(false);
    });
  });

  describe('Object Loading', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });
    });

    it('should load objects with custom options', () => {
      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      // Call loadObjects through component initialization
      fixture.detectChanges();

      expect(mockStorageService.listObjects).toHaveBeenCalledWith('test-bucket', {
        prefix: '',
        delimiter: '/',
        cursor: undefined,
        limit: 100
      });
    });

    it('should load more objects with cursor', () => {
      component.cursor = 'existing-cursor';
      component.hasMore = true;
      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      // Trigger loadMore which calls loadObjects internally
      component.loadMore();
      fixture.detectChanges();

      expect(mockStorageService.listObjects).toHaveBeenCalledWith('test-bucket', {
        prefix: '',
        delimiter: '/',
        cursor: 'existing-cursor',
        limit: 100
      });
      expect(component.loadingMore).toBe(true);
    });

    it('should append objects when loading more', () => {
      component.objects = [mockStorageObject];
      component.cursor = 'next-cursor';
      
      const additionalObject: StorageObject = {
        ...mockStorageObject,
        id: 2,
        key: 'another-file.txt'
      };

      const additionalResponse: ListObjectsResponse = {
        bucket: 'test-bucket',
        objects: [additionalObject],
        common_prefixes: [],
        cursor: '',
        has_more: false
      };

      mockStorageService.listObjects.and.returnValue(of(additionalResponse));

      // Trigger loadMore to simulate loading more objects
      component.loadMore();
      fixture.detectChanges();

      expect(component.objects).toEqual(jasmine.arrayContaining([mockStorageObject, additionalObject]));
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      component.objects = [
        mockStorageObject,
        { ...mockStorageObject, key: 'document.pdf' },
        { ...mockStorageObject, key: 'image.jpg' }
      ];
      component.filteredObjects = [...component.objects];
    });

    it('should filter objects by search term', () => {
      component.searchTerm = 'doc';
      component.filterObjects();

      expect(component.filteredObjects).toEqual(jasmine.arrayContaining([
        jasmine.objectContaining({ key: 'document.pdf' })
      ]));
      expect(component.filteredObjects.length).toBe(1);
    });

    it('should be case insensitive in search', () => {
      component.searchTerm = 'DOC';
      component.filterObjects();

      expect(component.filteredObjects).toEqual(jasmine.arrayContaining([
        jasmine.objectContaining({ key: 'document.pdf' })
      ]));
      expect(component.filteredObjects.length).toBe(1);
    });

    it('should show all objects when search term is empty', () => {
      component.searchTerm = '';
      component.filterObjects();

      expect(component.filteredObjects.length).toBe(3);
    });

    it('should show no results for non-matching search', () => {
      component.searchTerm = 'nonexistent';
      component.filterObjects();

      expect(component.filteredObjects.length).toBe(0);
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });
    });

    it('should navigate to folder', () => {
      component.navigateToFolder('folder/');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/buckets', 'test-bucket', 'browse', 'folder']);
    });

    it('should navigate to folder without trailing slash', () => {
      component.navigateToFolder('folder');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/buckets', 'test-bucket', 'browse', 'folder']);
    });

    it('should navigate to specific path', () => {
      component.navigateToPath('folder/subfolder');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/buckets', 'test-bucket', 'browse', 'folder/subfolder']);
    });

    it('should navigate to root when path is empty', () => {
      component.navigateToPath('');

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/buckets', 'test-bucket']);
    });

    it('should get path up to specific part', () => {
      component.pathParts = ['folder', 'subfolder', 'deep'];
      
      const result = component.getPathUpTo('subfolder');
      
      expect(result).toBe('folder/subfolder');
    });

    it('should get folder name from path', () => {
      const result = component.getFolderName('folder/subfolder/');
      
      expect(result).toBe('subfolder');
    });

    it('should get folder name without trailing slash', () => {
      const result = component.getFolderName('folder/subfolder');
      
      expect(result).toBe('subfolder');
    });

    it('should get object name relative to current path', () => {
      component.currentPath = 'folder';
      
      const result = component.getObjectName('folder/test-file.txt');
      
      expect(result).toBe('test-file.txt');
    });

    it('should get object name when current path is empty', () => {
      component.currentPath = '';
      
      const result = component.getObjectName('test-file.txt');
      
      expect(result).toBe('test-file.txt');
    });
  });

  describe('Utility Functions', () => {
    it('should format file size correctly', () => {
      expect(component.formatFileSize(0)).toBe('0 Bytes');
      expect(component.formatFileSize(1024)).toBe('1 KB');
      expect(component.formatFileSize(1048576)).toBe('1 MB');
      expect(component.formatFileSize(1073741824)).toBe('1 GB');
    });

    it('should format date correctly', () => {
      const dateString = '2024-01-01T12:00:00Z';
      const result = component.formatDate(dateString);
      
      expect(result).toContain('1/1/2024');
    });
  });

  describe('Load More', () => {
    beforeEach(() => {
      component.hasMore = true;
      component.cursor = 'next-cursor';
      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));
    });

    it('should load more when has more and not loading', () => {
      component.loadMore();
      
      expect(mockStorageService.listObjects).toHaveBeenCalled();
    });

    it('should not load more when already loading', () => {
      component.loadingMore = true;
      
      component.loadMore();
      
      // Should not make additional calls
      expect(mockStorageService.listObjects).not.toHaveBeenCalled();
    });

    it('should not load more when no more items', () => {
      component.hasMore = false;
      
      component.loadMore();
      
      // Should not make additional calls
      expect(mockStorageService.listObjects).not.toHaveBeenCalled();
    });
  });

  describe('Refresh', () => {
    it('should reset cursor and reload objects', () => {
      component.cursor = 'existing-cursor';
      
      component.refresh();
      
      expect(component.cursor).toBeUndefined();
    });
  });

  describe('User Actions', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      }));
    });

    it('should handle create folder action', () => {
      spyOn(console, 'log');
      
      component.createFolder();
      
      expect(console.log).toHaveBeenCalledWith('Create folder in:', component.currentPath);
    });

    it('should handle upload file action', () => {
      spyOn(console, 'log');
      
      component.uploadFile();
      
      expect(console.log).toHaveBeenCalledWith('Upload file to:', component.currentPath);
    });

    it('should handle object selection', () => {
      spyOn(console, 'log');
      
      component.selectObject(mockStorageObject);
      
      expect(console.log).toHaveBeenCalledWith('Selected object:', mockStorageObject);
    });

    it('should handle object download', () => {
      spyOn(console, 'log');
      
      component.downloadObject(mockStorageObject);
      
      expect(console.log).toHaveBeenCalledWith('Download object:', mockStorageObject);
    });

    it('should handle object deletion', () => {
      spyOn(console, 'log');
      
      component.deleteObject(mockStorageObject);
      
      expect(console.log).toHaveBeenCalledWith('Delete object:', mockStorageObject);
    });

    it('should handle show object details', () => {
      spyOn(console, 'log');
      
      component.showObjectDetails(mockStorageObject);
      
      expect(console.log).toHaveBeenCalledWith('Show details for:', mockStorageObject);
    });
  });

  describe('Component Destruction', () => {
    it('should complete destroy subject on destroy', () => {
      spyOn(destroySubject, 'next');
      spyOn(destroySubject, 'complete');
      
      component.ngOnDestroy();
      
      expect(destroySubject.next).toHaveBeenCalled();
      expect(destroySubject.complete).toHaveBeenCalled();
    });
  });

  describe('File Upload Security', () => {
    beforeEach(() => {
      mockFileSecurityService.getAllowedExtensions.and.returnValue(['.jpg', '.png', '.pdf']);
      mockFileSecurityService.getMaxFileSize.and.returnValue(10 * 1024 * 1024);
      mockFileSecurityService.getSecurityRules.and.returnValue([]);
    });

    it('should show file upload modal when upload button clicked', () => {
      component.uploadFile();

      expect(component.showFileUpload).toBe(true);
    });

    it('should hide file upload modal when no files selected', () => {
      component.showFileUpload = true;
      component.onFilesSelected([]);

      expect(component.showFileUpload).toBe(false);
    });

    it('should handle valid file selection', () => {
      const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      mockFileSecurityService.validateFile.and.returnValue(mockResult);
      mockStorageService.createObject.and.returnValue(of({}));

      component.onFilesSelected([validFile]);

      expect(component.uploadingFiles).toBe(true);
      expect(mockStorageService.createObject).toHaveBeenCalledWith(
        'test-bucket',
        'test.jpg'
      );
    });

    it('should handle file upload completion', () => {
      spyOn(component, 'refresh');
      const result = {
        success: [new File(['content'], 'test.jpg', { type: 'image/jpeg' })],
        failed: []
      };

      component.onUploadComplete(result);

      expect(component.uploadingFiles).toBe(false);
    });

    it('should handle file upload failures', () => {
      spyOn(console, 'error');
      const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      mockFileSecurityService.validateFile.and.returnValue(mockResult);
      mockStorageService.createObject.and.returnValue(throwError('Upload failed'));

      component.onFilesSelected([validFile]);

      expect(console.error).toHaveBeenCalledWith('Upload failed:', 'Upload failed');
      expect(component.uploadingFiles).toBe(false);
    });

    it('should handle multiple file uploads', () => {
      const file1 = new File(['content1'], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['content2'], 'test2.png', { type: 'image/png' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      mockFileSecurityService.validateFile.and.returnValue(mockResult);
      mockStorageService.createObject.and.returnValue(of({}));

      component.onFilesSelected([file1, file2]);

      expect(mockStorageService.createObject).toHaveBeenCalledTimes(2);
      expect(mockStorageService.createObject).toHaveBeenCalledWith(
        'test-bucket',
        'test1.jpg'
      );
      expect(mockStorageService.createObject).toHaveBeenCalledWith(
        'test-bucket',
        'test2.png'
      );
    });

    it('should handle file uploads with current path', () => {
      component.currentPath = 'folder';
      const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      mockFileSecurityService.validateFile.and.returnValue(mockResult);
      mockStorageService.createObject.and.returnValue(of({}));

      component.onFilesSelected([validFile]);

      expect(mockStorageService.createObject).toHaveBeenCalledWith(
        'test-bucket',
        'folder/test.jpg'
      );
    });
  });
});
