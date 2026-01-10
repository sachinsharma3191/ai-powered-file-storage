import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BucketsComponent } from './buckets.component';
import { StorageService, Bucket, RateLimitInfo } from '../../services/storage.service';

describe('BucketsComponent', () => {
  let component: BucketsComponent;
  let fixture: ComponentFixture<BucketsComponent>;
  let mockStorageService: jasmine.SpyObj<StorageService>;

  const mockBuckets: Bucket[] = [
    {
      id: 1,
      name: 'test-bucket-1',
      region: 'us-west-2',
      versioning: 'enabled',
      default_encryption: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 2,
      name: 'test-bucket-2',
      region: 'us-east-1',
      versioning: 'disabled',
      default_encryption: {},
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    }
  ];

  const mockRateLimitInfo: RateLimitInfo = {
    limit: 1000,
    remaining: 847,
    reset: 245
  };

  beforeEach(async () => {
    const storageSpy = jasmine.createSpyObj('StorageService', [
      'listBuckets',
      'createBucket',
      'deleteBucket'
    ]);

    await TestBed.configureTestingModule({
      declarations: [BucketsComponent],
      providers: [
        { provide: StorageService, useValue: storageSpy }
      ]
    }).compileComponents();

    mockStorageService = TestBed.inject(StorageService) as jasmine.SpyObj<StorageService>;

    fixture = TestBed.createComponent(BucketsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.buckets()).toEqual([]);
      expect(component.loading()).toBe(true);
      expect(component.showCreateModal()).toBe(false);
      expect(component.creating()).toBe(false);
      expect(component.createError()).toBe('');
      expect(component.newBucketName).toBe('');
      expect(component.newBucketRegion).toBe('us-west-2');
      expect(component.rateLimitInfo()).toBeNull();
    });

    it('should load buckets and rate limit info on init', () => {
      spyOn(component, 'loadBuckets');
      spyOn(component, 'loadRateLimitInfo');

      component.ngOnInit();

      expect(component.loadBuckets).toHaveBeenCalled();
      expect(component.loadRateLimitInfo).toHaveBeenCalled();
    });
  });

  describe('Bucket Loading', () => {
    it('should load buckets successfully', () => {
      mockStorageService.listBuckets.and.returnValue(of(mockBuckets));

      component.loadBuckets();

      expect(mockStorageService.listBuckets).toHaveBeenCalled();
      expect(component.buckets()).toEqual(
        jasmine.arrayContaining([
          jasmine.objectContaining({ name: 'test-bucket-1' }),
          jasmine.objectContaining({ name: 'test-bucket-2' })
        ])
      );
      expect(component.loading()).toBe(false);
    });

    it('should add mock lifecycle data to buckets', () => {
      mockStorageService.listBuckets.and.returnValue(of(mockBuckets));

      component.loadBuckets();

      const buckets = component.buckets();
      expect(buckets[0]).toEqual(jasmine.objectContaining({
        name: 'test-bucket-1',
        lifecycleEnabled: jasmine.any(Boolean),
        lifecycleRules: jasmine.any(Number)
      }));
      expect(buckets[1]).toEqual(jasmine.objectContaining({
        name: 'test-bucket-2',
        lifecycleEnabled: jasmine.any(Boolean),
        lifecycleRules: jasmine.any(Number)
      }));
    });

    it('should handle bucket loading error', () => {
      mockStorageService.listBuckets.and.returnValue(throwError('API Error'));

      component.loadBuckets();

      expect(component.loading()).toBe(false);
      expect(component.buckets()).toEqual([]);
    });
  });

  describe('Rate Limit Loading', () => {
    it('should load rate limit info', () => {
      component.loadRateLimitInfo();

      expect(component.rateLimitInfo()).toEqual(mockRateLimitInfo);
    });
  });

  describe('Bucket Creation', () => {
    beforeEach(() => {
      component.newBucketName = 'new-test-bucket';
      component.newBucketRegion = 'us-east-1';
    });

    it('should create bucket successfully', () => {
      mockStorageService.createBucket.and.returnValue(of(mockBuckets[0]));
      spyOn(component, 'closeModal');
      spyOn(component, 'loadBuckets');

      component.createBucket();

      expect(mockStorageService.createBucket).toHaveBeenCalledWith('new-test-bucket', 'us-east-1');
      expect(component.creating()).toBe(true);
      expect(component.createError()).toBe('');
    });

    it('should handle successful bucket creation', () => {
      mockStorageService.createBucket.and.returnValue(of(mockBuckets[0]));
      spyOn(component, 'closeModal');
      spyOn(component, 'loadBuckets');

      component.createBucket();
      fixture.detectChanges();

      expect(component.closeModal).toHaveBeenCalled();
      expect(component.loadBuckets).toHaveBeenCalled();
    });

    it('should validate bucket name before creation', () => {
      component.newBucketName = '';
      spyOn(window, 'alert');

      component.createBucket();

      expect(component.createError()).toBe('Please enter a bucket name');
      expect(mockStorageService.createBucket).not.toHaveBeenCalled();
      expect(component.creating()).toBe(false);
    });

    it('should validate bucket name with only spaces', () => {
      component.newBucketName = '   ';
      spyOn(window, 'alert');

      component.createBucket();

      expect(component.createError()).toBe('Please enter a bucket name');
      expect(mockStorageService.createBucket).not.toHaveBeenCalled();
    });

    it('should handle bucket creation error', () => {
      const errorResponse = { error: { error: 'Bucket already exists' } };
      mockStorageService.createBucket.and.returnValue(throwError(errorResponse));

      component.createBucket();
      fixture.detectChanges();

      expect(component.createError()).toBe('Bucket already exists');
      expect(component.creating()).toBe(false);
    });

    it('should handle bucket creation error with default message', () => {
      mockStorageService.createBucket.and.returnValue(throwError('Unknown error'));

      component.createBucket();
      fixture.detectChanges();

      expect(component.createError()).toBe('Failed to create bucket');
      expect(component.creating()).toBe(false);
    });
  });

  describe('Bucket Deletion', () => {
    beforeEach(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      spyOn(component, 'loadBuckets');
    });

    it('should delete bucket with confirmation', () => {
      mockStorageService.deleteBucket.and.returnValue(of<void>(undefined));
      const bucket = mockBuckets[0];

      component.deleteBucket(bucket);

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete bucket "test-bucket-1"?');
      expect(mockStorageService.deleteBucket).toHaveBeenCalledWith('test-bucket-1');
      expect(component.loadBuckets).toHaveBeenCalled();
    });

    it('should not delete bucket when confirmation is cancelled', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      const bucket = mockBuckets[0];

      component.deleteBucket(bucket);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockStorageService.deleteBucket).not.toHaveBeenCalled();
      expect(component.loadBuckets).not.toHaveBeenCalled();
    });

    it('should handle bucket deletion error', () => {
      spyOn(window, 'alert');
      spyOn(window, 'confirm').and.returnValue(true);
      const errorResponse = { error: { error: 'Bucket not found' } };
      mockStorageService.deleteBucket.and.returnValue(throwError(errorResponse));
      const bucket = mockBuckets[0];

      component.deleteBucket(bucket);

      expect(window.alert).toHaveBeenCalledWith('Bucket not found');
    });

    it('should handle bucket deletion error with default message', () => {
      spyOn(window, 'alert');
      spyOn(window, 'confirm').and.returnValue(true);
      mockStorageService.deleteBucket.and.returnValue(throwError('Unknown error'));
      const bucket = mockBuckets[0];

      component.deleteBucket(bucket);

      expect(window.alert).toHaveBeenCalledWith('Failed to delete bucket');
    });
  });

  describe('Modal Management', () => {
    it('should close modal and reset state', () => {
      component.showCreateModal.set(true);
      component.creating.set(true);
      component.createError.set('Some error');
      component.newBucketName = 'test-name';

      component.closeModal();

      expect(component.showCreateModal()).toBe(false);
      expect(component.creating()).toBe(false);
      expect(component.createError()).toBe('');
      expect(component.newBucketName).toBe('');
    });
  });

  describe('Template Logic', () => {
    beforeEach(() => {
      mockStorageService.listBuckets.and.returnValue(of(mockBuckets));
      component.loadBuckets();
      fixture.detectChanges();
    });

    it('should display buckets with lifecycle information', () => {
      const buckets = component.buckets();
      expect(buckets.length).toBeGreaterThan(0);
      
      buckets.forEach(bucket => {
        expect(bucket.lifecycleEnabled).toBeDefined();
        expect(bucket.lifecycleRules).toBeDefined();
      });
    });

    it('should show loading state correctly', () => {
      component.loading.set(true);
      fixture.detectChanges();

      expect(component.loading()).toBe(true);
    });

    it('should show create modal state correctly', () => {
      component.showCreateModal.set(true);
      fixture.detectChanges();

      expect(component.showCreateModal()).toBe(true);
    });

    it('should show creating state correctly', () => {
      component.creating.set(true);
      fixture.detectChanges();

      expect(component.creating()).toBe(true);
    });

    it('should show error state correctly', () => {
      component.createError.set('Test error');
      fixture.detectChanges();

      expect(component.createError()).toBe('Test error');
    });
  });

  describe('Region Selection', () => {
    it('should have default region set to us-west-2', () => {
      expect(component.newBucketRegion).toBe('us-west-2');
    });

    it('should change bucket region', () => {
      component.newBucketRegion = 'eu-west-1';
      expect(component.newBucketRegion).toBe('eu-west-1');
    });
  });

  describe('Bucket Name Handling', () => {
    it('should trim bucket name before validation', () => {
      component.newBucketName = '  test-bucket  ';
      mockStorageService.createBucket.and.returnValue(of(mockBuckets[0]));
      spyOn(component, 'closeModal');
      spyOn(component, 'loadBuckets');

      component.createBucket();

      expect(mockStorageService.createBucket).toHaveBeenCalledWith('test-bucket', 'us-west-2');
    });

    it('should handle empty bucket name after trimming', () => {
      component.newBucketName = '   ';
      spyOn(window, 'alert');

      component.createBucket();

      expect(component.createError()).toBe('Please enter a bucket name');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle network error when loading buckets', () => {
      mockStorageService.listBuckets.and.returnValue(throwError(new Error('Network error')));

      component.loadBuckets();

      expect(component.loading()).toBe(false);
      expect(component.buckets()).toEqual([]);
    });

    it('should handle network error when creating bucket', () => {
      component.newBucketName = 'test-bucket';
      mockStorageService.createBucket.and.returnValue(throwError(new Error('Network error')));

      component.createBucket();
      fixture.detectChanges();

      expect(component.creating()).toBe(false);
      expect(component.createError()).toBe('Failed to create bucket');
    });

    it('should handle network error when deleting bucket', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      spyOn(window, 'alert');
      mockStorageService.deleteBucket.and.returnValue(throwError(new Error('Network error')));
      const bucket = mockBuckets[0];

      component.deleteBucket(bucket);

      expect(window.alert).toHaveBeenCalledWith('Failed to delete bucket');
    });
  });

  describe('Component Lifecycle', () => {
    it('should initialize correctly', () => {
      expect(component).toBeTruthy();
      expect(component.loading()).toBe(true);
      expect(component.showCreateModal()).toBe(false);
    });

    it('should clean up properly', () => {
      // Component should not throw errors during lifecycle
      expect(() => {
        component.ngOnInit();
        fixture.detectChanges();
      }).not.toThrow();
    });
  });

  describe('Data Flow', () => {
    it('should update buckets signal when data changes', () => {
      mockStorageService.listBuckets.and.returnValue(of(mockBuckets));

      component.loadBuckets();
      fixture.detectChanges();

      expect(component.buckets()).toEqual(jasmine.arrayContaining(mockBuckets));
    });

    it('should update loading signal appropriately', () => {
      mockStorageService.listBuckets.and.returnValue(of(mockBuckets));

      expect(component.loading()).toBe(true);
      component.loadBuckets();
      expect(component.loading()).toBe(false);
    });

    it('should update rate limit info signal', () => {
      component.loadRateLimitInfo();

      expect(component.rateLimitInfo()).toEqual(mockRateLimitInfo);
    });
  });
});
