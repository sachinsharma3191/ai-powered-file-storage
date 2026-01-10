import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { BucketObjectsComponent } from './bucket-objects.component';
import { StorageService, ListObjectsResponse, StorageObject, RateLimitInfo } from '../../services/storage.service';

describe('BucketObjectsComponent', () => {
  let component: BucketObjectsComponent;
  let fixture: ComponentFixture<BucketObjectsComponent>;
  let mockStorageService: jasmine.SpyObj<StorageService>;
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
    updated_at: '2024-01-01T00:00:00Z',
    version_id: 'v1',
    is_latest: true,
    is_delete_marker: false
  };

  const mockListObjectsResponse: ListObjectsResponse = {
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
    
    const storageSpy = jasmine.createSpyObj('StorageService', ['listObjects']);
    const routeSpy = jasmine.createSpyObj('ActivatedRoute', ['params']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [BucketObjectsComponent],
      providers: [
        { provide: StorageService, useValue: storageSpy },
        { provide: ActivatedRoute, useValue: routeSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    mockStorageService = TestBed.inject(StorageService) as jasmine.SpyObj<StorageService>;
    mockActivatedRoute = TestBed.inject(ActivatedRoute) as jasmine.SpyObj<ActivatedRoute>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;

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
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket',
        path: 'folder/subfolder'
      }));

      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      fixture.detectChanges();

      expect(component.bucketName).toBe('test-bucket');
      expect(component.currentPath).toBe('folder/subfolder');
      expect(component.pathParts).toEqual(['folder', 'subfolder']);
    });

    it('should handle empty path in route params', () => {
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket'
      }));

      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      fixture.detectChanges();

      expect(component.currentPath).toBe('');
      expect(component.pathParts).toEqual([]);
    });

    it('should load objects on initialization', () => {
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket'
      }));

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
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket'
      }));

      mockStorageService.listObjects.and.returnValue(throwError('API Error'));

      fixture.detectChanges();

      expect(component.loading).toBe(false);
      expect(component.loadingMore).toBe(false);
    });
  });

  describe('Object Loading', () => {
    beforeEach(() => {
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket'
      }));
    });

    it('should load objects with custom options', () => {
      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));

      component.loadObjects();

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

      component.loadObjects(true);

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
        objects: [additionalObject],
        common_prefixes: [],
        cursor: '',
        has_more: false
      };

      mockStorageService.listObjects.and.returnValue(of(additionalResponse));

      component.loadObjects(true);
      fixture.detectChanges();

      expect(component.objects).toHaveLength(2);
      expect(component.objects).toContain(mockStorageObject);
      expect(component.objects).toContain(additionalObject);
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

      expect(component.filteredObjects).toHaveLength(1);
      expect(component.filteredObjects[0].key).toBe('document.pdf');
    });

    it('should be case insensitive in search', () => {
      component.searchTerm = 'DOC';
      component.filterObjects();

      expect(component.filteredObjects).toHaveLength(1);
      expect(component.filteredObjects[0].key).toBe('document.pdf');
    });

    it('should show all objects when search term is empty', () => {
      component.searchTerm = '';
      component.filterObjects();

      expect(component.filteredObjects).toHaveLength(3);
    });

    it('should show no results for non-matching search', () => {
      component.searchTerm = 'nonexistent';
      component.filterObjects();

      expect(component.filteredObjects).toHaveLength(0);
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      mockActivatedRoute.params.and.returnValue(of({
        bucketName: 'test-bucket'
      }));
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

    it('should update path parts correctly', () => {
      component.currentPath = 'folder/subfolder/deep';
      component.updatePathParts();
      
      expect(component.pathParts).toEqual(['folder', 'subfolder', 'deep']);
    });

    it('should handle empty path when updating path parts', () => {
      component.currentPath = '';
      component.updatePathParts();
      
      expect(component.pathParts).toEqual([]);
    });
  });

  describe('Load More', () => {
    beforeEach(() => {
      component.hasMore = true;
      component.cursor = 'next-cursor';
      mockStorageService.listObjects.and.returnValue(of(mockListObjectsResponse));
    });

    it('should load more when has more and not loading', () => {
      spyOn(component, 'loadObjects');
      
      component.loadMore();
      
      expect(component.loadObjects).toHaveBeenCalledWith(true);
    });

    it('should not load more when already loading', () => {
      component.loadingMore = true;
      spyOn(component, 'loadObjects');
      
      component.loadMore();
      
      expect(component.loadObjects).not.toHaveBeenCalled();
    });

    it('should not load more when no more items', () => {
      component.hasMore = false;
      spyOn(component, 'loadObjects');
      
      component.loadMore();
      
      expect(component.loadObjects).not.toHaveBeenCalled();
    });
  });

  describe('Refresh', () => {
    beforeEach(() => {
      spyOn(component, 'loadObjects');
    });

    it('should reset cursor and reload objects', () => {
      component.cursor = 'existing-cursor';
      
      component.refresh();
      
      expect(component.cursor).toBeUndefined();
      expect(component.loadObjects).toHaveBeenCalledWith(false);
    });
  });

  describe('User Actions', () => {
    beforeEach(() => {
      mockActivatedRoute.params.and.returnValue(of({
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
});
