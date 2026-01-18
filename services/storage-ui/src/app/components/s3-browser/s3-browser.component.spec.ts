import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

import { S3BrowserComponent } from './s3-browser.component';
import { S3Service, S3Bucket, S3Object } from '../../services/s3.service';

describe('S3BrowserComponent', () => {
  let component: S3BrowserComponent;
  let fixture: ComponentFixture<S3BrowserComponent>;
  let mockS3Service: jasmine.SpyObj<S3Service>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockBuckets: S3Bucket[] = [
    {
      name: 'test-bucket-1',
      creation_date: '2024-01-01T00:00:00Z',
      region: 'us-east-1'
    },
    {
      name: 'test-bucket-2',
      creation_date: '2024-01-02T00:00:00Z',
      region: 'us-west-2'
    }
  ];

  const mockObjects: S3Object[] = [
    {
      key: 'folder1/file1.txt',
      last_modified: '2024-01-01T00:00:00Z',
      size: 1024,
      storage_class: 'STANDARD',
      etag: '"test-etag-1"'
    },
    {
      key: 'folder1/file2.pdf',
      last_modified: '2024-01-02T00:00:00Z',
      size: 2048,
      storage_class: 'STANDARD',
      etag: '"test-etag-2"'
    },
    {
      key: 'folder2/',
      last_modified: '2024-01-03T00:00:00Z',
      size: 0,
      storage_class: 'STANDARD',
      etag: '"folder-etag"'
    }
  ];

  beforeEach(async () => {
    const s3ServiceSpy = jasmine.createSpyObj('S3Service', [
      'listBuckets',
      'listObjects',
      'createBucket',
      'deleteBucket',
      'deleteObject',
      'getDownloadUrl'
    ]);

    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    s3ServiceSpy.listBuckets.and.returnValue(of(mockBuckets));
    s3ServiceSpy.listObjects.and.returnValue(of({
      objects: mockObjects,
      isTruncated: false,
      nextContinuationToken: null
    }));
    s3ServiceSpy.createBucket.and.returnValue(of({}));
    s3ServiceSpy.deleteBucket.and.returnValue(of({}));
    s3ServiceSpy.deleteObject.and.returnValue(of({}));
    s3ServiceSpy.getDownloadUrl.and.returnValue(of('http://example.com/download'));

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        S3BrowserComponent
      ],
      providers: [
        { provide: S3Service, useValue: s3ServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(S3BrowserComponent);
    component = fixture.componentInstance;
    mockS3Service = TestBed.inject(S3Service) as jasmine.SpyObj<S3Service>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should load buckets on ngOnInit', waitForAsync(() => {
      component.ngOnInit();
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.listBuckets).toHaveBeenCalled();
        expect(component.buckets).toEqual(mockBuckets);
        expect(component.isLoading).toBeFalse();
      });
    }));

    it('should handle error when loading buckets', waitForAsync(() => {
      mockS3Service.listBuckets.and.returnValue(throwError(() => new Error('Failed to load buckets')));
      spyOn(console, 'error');
      
      component.ngOnInit();
      
      fixture.whenStable().then(() => {
        expect(component.isLoading).toBeFalse();
        expect(component.buckets).toEqual([]);
        expect(console.error).toHaveBeenCalledWith('Error loading buckets:', jasmine.any(Error));
      });
    }));
  });

  describe('Bucket Operations', () => {
    beforeEach(() => {
      component.buckets = mockBuckets;
      fixture.detectChanges();
    });

    it('should select bucket', () => {
      component.selectBucket(mockBuckets[0]);
      
      expect(component.selectedBucket).toBe(mockBuckets[0]);
      expect(mockS3Service.listObjects).toHaveBeenCalledWith(mockBuckets[0].name, '', null);
    });

    it('should create new bucket', waitForAsync(() => {
      const bucketName = 'new-test-bucket';
      
      component.createBucket(bucketName);
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.createBucket).toHaveBeenCalledWith(bucketName);
        expect(mockS3Service.listBuckets).toHaveBeenCalled();
      });
    }));

    it('should not create bucket with empty name', () => {
      component.createBucket('');
      
      expect(mockS3Service.createBucket).not.toHaveBeenCalled();
    });

    it('should delete bucket after confirmation', waitForAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      
      component.deleteBucket(mockBuckets[0]);
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.deleteBucket).toHaveBeenCalledWith(mockBuckets[0].name);
        expect(mockS3Service.listBuckets).toHaveBeenCalled();
      });
    }));

    it('should not delete bucket if not confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      
      component.deleteBucket(mockBuckets[0]);
      
      expect(mockS3Service.deleteBucket).not.toHaveBeenCalled();
    });

    it('should refresh bucket list', waitForAsync(() => {
      mockS3Service.listBuckets.calls.reset();
      
      component.refreshBuckets();
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.listBuckets).toHaveBeenCalled();
      });
    }));
  });

  describe('Object Operations', () => {
    beforeEach(() => {
      component.selectedBucket = mockBuckets[0];
      component.objects = mockObjects;
      fixture.detectChanges();
    });

    it('should navigate into folder', () => {
      component.navigateIntoFolder('folder1/');
      
      expect(component.currentPath).toBe('folder1/');
      expect(mockS3Service.listObjects).toHaveBeenCalledWith(
        mockBuckets[0].name,
        'folder1/',
        null
      );
    });

    it('should navigate to parent folder', () => {
      component.currentPath = 'folder1/subfolder/';
      
      component.navigateToParent();
      
      expect(component.currentPath).toBe('folder1/');
      expect(mockS3Service.listObjects).toHaveBeenCalledWith(
        mockBuckets[0].name,
        'folder1/',
        null
      );
    });

    it('should navigate to root', () => {
      component.currentPath = 'folder1/subfolder/';
      
      component.navigateToPath('');
      
      expect(component.currentPath).toBe('');
      expect(mockS3Service.listObjects).toHaveBeenCalledWith(
        mockBuckets[0].name,
        '',
        null
      );
    });

    it('should delete object after confirmation', waitForAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      
      component.deleteObject(mockObjects[0]);
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.deleteObject).toHaveBeenCalledWith(
          mockBuckets[0].name,
          mockObjects[0].key
        );
        expect(mockS3Service.listObjects).toHaveBeenCalled();
      });
    }));

    it('should not delete object if not confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      
      component.deleteObject(mockObjects[0]);
      
      expect(mockS3Service.deleteObject).not.toHaveBeenCalled();
    });

    it('should get download URL for object', waitForAsync(() => {
      component.downloadObject(mockObjects[0]);
      
      fixture.whenStable().then(() => {
        expect(mockS3Service.getDownloadUrl).toHaveBeenCalledWith(
          mockBuckets[0].name,
          mockObjects[0].key
        );
      });
    }));

    it('should get upload URL for object', () => {
      const result = component.getUploadUrl(mockObjects[0]);
      
      expect(result).toContain(`/buckets/${mockBuckets[0].name}/upload`);
      expect(result).toContain(mockObjects[0].key);
    });
  });

  describe('Helper Methods', () => {
    it('should get path up to folder', () => {
      expect(component.getPathUpTo('folder1/subfolder/file.txt', 'folder1/')).toBe('folder1/');
      expect(component.getPathUpTo('folder1/subfolder/file.txt', 'subfolder/')).toBe('folder1/subfolder/');
      expect(component.getPathUpTo('file.txt', '')).toBe('');
    });

    it('should check if object is folder', () => {
      const folder = { key: 'folder1/', size: 0 } as S3Object;
      const file = { key: 'file.txt', size: 1024 } as S3Object;
      
      expect(component.isFolder(folder)).toBeTrue();
      expect(component.isFolder(file)).toBeFalse();
    });

    it('should get object name from key', () => {
      expect(component.getObjectName('folder1/file.txt')).toBe('file.txt');
      expect(component.getObjectName('folder1/')).toBe('folder1/');
      expect(component.getObjectName('file.txt')).toBe('file.txt');
    });

    it('should format file size', () => {
      expect(component.formatFileSize(1024)).toBe('1 KB');
      expect(component.formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(component.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(component.formatFileSize(0)).toBe('0 B');
    });

    it('should format date', () => {
      const date = '2024-01-01T00:00:00Z';
      const result = component.formatDate(date);
      
      expect(result).toContain('2024');
    });

    it('should get breadcrumb paths', () => {
      component.currentPath = 'folder1/subfolder/';
      
      const breadcrumbs = component.getBreadcrumbPaths();
      
      expect(breadcrumbs).toEqual([
        { name: 'Home', path: '' },
        { name: 'folder1', path: 'folder1/' },
        { name: 'subfolder', path: 'folder1/subfolder/' }
      ]);
    });

    it('should filter objects by current path', () => {
      component.currentPath = 'folder1/';
      const allObjects = [...mockObjects, { key: 'other/file.txt', size: 512 } as S3Object];
      
      const filtered = component.getObjectsInCurrentPath(allObjects);
      
      expect(filtered.length).toBe(3); // folder2/ should not be included
      expect(filtered.every(obj => obj.key.startsWith('folder1/') || obj.key === 'folder1/')).toBeTrue();
    });

    it('should get unique folders from objects', () => {
      const folders = component.getFolders(mockObjects);
      
      expect(folders).toEqual(['folder1/', 'folder2/']);
    });
  });

  describe('Search and Filter', () => {
    beforeEach(() => {
      component.objects = mockObjects;
      component.filteredObjects = mockObjects;
      fixture.detectChanges();
    });

    it('should filter objects by search term', () => {
      component.searchTerm = 'file1';
      component.filterObjects();
      
      expect(component.filteredObjects.length).toBe(1);
      expect(component.filteredObjects[0].key).toBe('folder1/file1.txt');
    });

    it('should show all objects when search term is empty', () => {
      component.filteredObjects = [mockObjects[0]];
      component.searchTerm = '';
      component.filterObjects();
      
      expect(component.filteredObjects).toEqual(mockObjects);
    });

    it('should filter by object type', () => {
      component.objectTypeFilter = 'folder';
      component.filterObjects();
      
      expect(component.filteredObjects.length).toBe(1);
      expect(component.filteredObjects[0].key).toBe('folder2/');
    });

    it('should clear search', () => {
      component.searchTerm = 'test';
      component.filteredObjects = [mockObjects[0]];
      
      component.clearSearch();
      
      expect(component.searchTerm).toBe('');
      expect(component.filteredObjects).toEqual(mockObjects);
    });
  });

  describe('Template Rendering', () => {
    it('should render bucket list', waitForAsync(() => {
      component.ngOnInit();
      
      fixture.whenStable().then(() => {
        fixture.detectChanges();
        const bucketItems = fixture.debugElement.queryAll(By.css('.bucket-item'));
        expect(bucketItems.length).toBe(2);
      });
    }));

    it('should render object list when bucket is selected', waitForAsync(() => {
      component.selectedBucket = mockBuckets[0];
      component.objects = mockObjects;
      fixture.detectChanges();
      
      const objectItems = fixture.debugElement.queryAll(By.css('.object-item'));
      expect(objectItems.length).toBe(3);
    }));

    it('should show loading state', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loading = fixture.debugElement.query(By.css('.loading'));
      expect(loading).toBeTruthy();
    });

    it('should show empty state when no buckets', () => {
      component.buckets = [];
      component.isLoading = false;
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.query(By.css('.empty-state'));
      expect(emptyState).toBeTruthy();
    });

    it('should render breadcrumbs when in subfolder', () => {
      component.selectedBucket = mockBuckets[0];
      component.currentPath = 'folder1/subfolder/';
      fixture.detectChanges();
      
      const breadcrumbs = fixture.debugElement.queryAll(By.css('.breadcrumb-item'));
      expect(breadcrumbs.length).toBe(3);
    });

    it('should show search input', () => {
      const searchInput = fixture.debugElement.query(By.css('input[placeholder*="Search"]'));
      expect(searchInput).toBeTruthy();
    });

    it('should render create bucket button', () => {
      const createButton = fixture.debugElement.query(By.css('.create-bucket-btn'));
      expect(createButton).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle list objects error', waitForAsync(() => {
      mockS3Service.listObjects.and.returnValue(throwError(() => new Error('Failed to list objects')));
      spyOn(console, 'error');
      
      component.selectBucket(mockBuckets[0]);
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error loading objects:', jasmine.any(Error));
        expect(component.objects).toEqual([]);
      });
    }));

    it('should handle create bucket error', waitForAsync(() => {
      mockS3Service.createBucket.and.returnValue(throwError(() => new Error('Failed to create bucket')));
      spyOn(console, 'error');
      
      component.createBucket('test-bucket');
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error creating bucket:', jasmine.any(Error));
      });
    }));

    it('should handle delete bucket error', waitForAsync(() => {
      mockS3Service.deleteBucket.and.returnValue(throwError(() => new Error('Failed to delete bucket')));
      spyOn(window, 'confirm').and.returnValue(true);
      spyOn(console, 'error');
      
      component.deleteBucket(mockBuckets[0]);
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error deleting bucket:', jasmine.any(Error));
      });
    }));
  });

  describe('Component Lifecycle', () => {
    it('should clean up subscriptions on ngOnDestroy', () => {
      component.ngOnInit();
      
      const subscription = component['subscriptions'][0];
      spyOn(subscription, 'unsubscribe');
      
      component.ngOnDestroy();
      
      expect(subscription.unsubscribe).toHaveBeenCalled();
    });
  });
});
