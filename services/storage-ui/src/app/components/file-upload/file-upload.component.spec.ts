import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileUploadComponent } from './file-upload.component';
import { FileSecurityService } from '../../services/file-security.service';

describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let fileSecurityService: jasmine.SpyObj<FileSecurityService>;

  beforeEach(async () => {
    const securitySpy = jasmine.createSpyObj('FileSecurityService', [
      'validateFile',
      'getAllowedExtensions',
      'getMaxFileSize',
      'getSecurityRules'
    ]);

    await TestBed.configureTestingModule({
      imports: [FileUploadComponent],
      providers: [
        { provide: FileSecurityService, useValue: securitySpy }
      ]
    }).compileComponents();

    fileSecurityService = TestBed.inject(FileSecurityService) as jasmine.SpyObj<FileSecurityService>;
    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.multiple).toBe(true);
      expect(component.maxFiles).toBe(10);
      expect(component.isDragOver()).toBe(false);
      expect(component.isUploading()).toBe(false);
      expect(component.securityResults()).toEqual([]);
      expect(component.selectedFiles()).toEqual([]);
      expect(component.showSecurityDetails()).toBe(false);
    });

    it('should initialize with custom values', () => {
      component.multiple = false;
      component.maxFiles = 5;
      fixture.detectChanges();

      expect(component.multiple).toBe(false);
      expect(component.maxFiles).toBe(5);
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag over', () => {
      const event = new Event('dragover', { bubbles: true, cancelable: true });
      spyOn(event, 'preventDefault');

      component.onDragOver(event);

      expect(component.isDragOver()).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should handle drag leave', () => {
      const event = new Event('dragleave', { bubbles: true, cancelable: true });
      spyOn(event, 'preventDefault');

      component.onDragOver(event);
      component.onDragLeave(event);

      expect(component.isDragOver()).toBe(false);
    });

    it('should handle file drop', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      fileSecurityService.validateFile.and.returnValue(mockResult);
      spyOn(component, 'processFiles' as any);

      // Create a mock DataTransfer object
      const dataTransfer = {
        files: [file]
      } as DataTransfer;

      const event = new Event('drop', { bubbles: true, cancelable: true });
      spyOn(event, 'preventDefault');
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

      component.onDrop(event);

      expect(component.isDragOver()).toBe(false);
      expect(component['processFiles']).toHaveBeenCalledWith([file]);
    });
  });

  describe('File Selection', () => {
    it('should handle file selection', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      spyOn(component, 'processFiles' as any);

      const input = document.createElement('input');
      input.type = 'file';
      input.files = [file] as any;

      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: input });

      component.onFileSelect(event);

      expect(component['processFiles']).toHaveBeenCalledWith([file]);
    });
  });

  describe('File Processing', () => {
    beforeEach(() => {
      fileSecurityService.getAllowedExtensions.and.returnValue(['.jpg', '.png']);
      fileSecurityService.getMaxFileSize.and.returnValue(10 * 1024 * 1024);
      fileSecurityService.getSecurityRules.and.returnValue([]);
    });

    it('should process valid files', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      fileSecurityService.validateFile.and.returnValue(mockResult);
      spyOn(component.filesSelected, 'emit');

      component['processFiles']([file]);

      expect(component.securityResults()).toEqual([mockResult]);
      expect(component.selectedFiles()).toEqual([file]);
      expect(component.filesSelected.emit).toHaveBeenCalledWith([file]);
    });

    it('should process invalid files', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      const mockResult = {
        isValid: false,
        errors: ['File blocked for security reasons'],
        warnings: [],
        fileType: '.exe',
        riskLevel: 'critical' as const
      };

      fileSecurityService.validateFile.and.returnValue(mockResult);
      spyOn(component.filesSelected, 'emit');

      component['processFiles']([file]);

      expect(component.securityResults()).toEqual([mockResult]);
      expect(component.selectedFiles()).toEqual([]);
      expect(component.filesSelected.emit).toHaveBeenCalledWith([]);
    });

    it('should handle mixed valid and invalid files', () => {
      const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const invalidFile = new File(['content'], 'test.exe', { type: 'application/octet-stream' });

      const validResult = {
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      };

      const invalidResult = {
        isValid: false,
        errors: ['File blocked for security reasons'],
        warnings: [],
        fileType: '.exe',
        riskLevel: 'critical' as const
      };

      fileSecurityService.validateFile.and.returnValues(validResult, invalidResult);
      spyOn(component.filesSelected, 'emit');

      component['processFiles']([validFile, invalidFile]);

      expect(component.securityResults()).toEqual([validResult, invalidResult]);
      expect(component.selectedFiles()).toEqual([validFile]);
      expect(component.filesSelected.emit).toHaveBeenCalledWith([validFile]);
    });

    it('should show alert for too many files', () => {
      spyOn(window, 'alert');
      const files = Array.from({ length: 15 }, (_, i) => 
        new File(['content'], `test${i}.jpg`, { type: 'image/jpeg' })
      );

      component['processFiles'](files);

      expect(window.alert).toHaveBeenCalledWith('Maximum 10 files allowed. Selected 15 files.');
    });
  });

  describe('File Upload', () => {
    beforeEach(() => {
      component.selectedFiles.set([new File(['content'], 'test.jpg', { type: 'image/jpeg' })]);
    });

    it('should upload files', () => {
      spyOn(component.uploadComplete, 'emit');
      jasmine.clock().install();

      component.uploadFiles();

      expect(component.isUploading()).toBe(true);

      jasmine.clock().tick(2000);

      expect(component.isUploading()).toBe(false);
      expect(component.uploadComplete.emit).toHaveBeenCalledWith({
        success: component.selectedFiles(),
        failed: []
      });

      jasmine.clock().uninstall();
    });

    it('should not upload when no files selected', () => {
      component.selectedFiles.set([]);
      spyOn(component.uploadComplete, 'emit');

      component.uploadFiles();

      expect(component.uploadComplete.emit).not.toHaveBeenCalled();
    });
  });

  describe('File Management', () => {
    it('should clear files', () => {
      component.selectedFiles.set([new File(['content'], 'test.jpg', { type: 'image/jpeg' })]);
      component.securityResults.set([{
        isValid: true,
        errors: [],
        warnings: [],
        fileType: '.jpg',
        riskLevel: 'low' as const
      }]);

      component.clearFiles();

      expect(component.selectedFiles()).toEqual([]);
      expect(component.securityResults()).toEqual([]);
    });
  });

  describe('Status Methods', () => {
    it('should detect errors', () => {
      component.securityResults.set([{
        isValid: false,
        errors: ['Error message'],
        warnings: [],
        fileType: '.exe',
        riskLevel: 'critical' as const
      }]);

      expect(component.hasErrors()).toBe(true);
    });

    it('should detect warnings', () => {
      component.securityResults.set([{
        isValid: true,
        errors: [],
        warnings: ['Warning message'],
        fileType: '.jpg',
        riskLevel: 'medium' as const
      }]);

      expect(component.hasWarnings()).toBe(true);
    });

    it('should detect valid files', () => {
      component.selectedFiles.set([new File(['content'], 'test.jpg', { type: 'image/jpeg' })]);

      expect(component.hasValidFiles()).toBe(true);
    });

    it('should get valid file count', () => {
      const files = [
        new File(['content'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['content'], 'test2.jpg', { type: 'image/jpeg' })
      ];
      component.selectedFiles.set(files);

      expect(component.getValidFileCount()).toBe(2);
    });
  });

  describe('Display Methods', () => {
    beforeEach(() => {
      fileSecurityService.getAllowedExtensions.and.returnValue(['.jpg', '.png', '.pdf', '.mp4']);
      fileSecurityService.getMaxFileSize.and.returnValue(500 * 1024 * 1024);
    });

    it('should get allowed file types', () => {
      const result = component.getAllowedFileTypes();

      expect(result).toBe('.jpg, .png, .pdf, .mp4');
    });

    it('should truncate long file type lists', () => {
      const manyExtensions = Array.from({ length: 15 }, (_, i) => `.ext${i}`);
      fileSecurityService.getAllowedExtensions.and.returnValue(manyExtensions);

      const result = component.getAllowedFileTypes();

      expect(result).toContain('...');
    });

    it('should get max file size text', () => {
      const result = component.getMaxFileSizeText();

      expect(result).toBe('500MB');
    });
  });

  describe('Security Details', () => {
    it('should toggle security details', () => {
      expect(component.showSecurityDetails()).toBe(false);

      component.showSecurityDetails.set(true);
      expect(component.showSecurityDetails()).toBe(true);
    });
  });

  describe('Template Integration', () => {
    beforeEach(() => {
      fileSecurityService.getAllowedExtensions.and.returnValue(['.jpg']);
      fileSecurityService.getMaxFileSize.and.returnValue(10 * 1024 * 1024);
      fileSecurityService.getSecurityRules.and.returnValue([{
        name: 'Test Rule',
        description: 'Test description',
        blocked: false,
        reason: 'Test reason',
        riskLevel: 'low' as const
      }]);
      fixture.detectChanges();
    });

    it('should render upload area', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const uploadArea = compiled.querySelector('.upload-area');

      expect(uploadArea).toBeTruthy();
    });

    it('should show error state when there are errors', () => {
      component.securityResults.set([{
        isValid: false,
        errors: ['Security error'],
        warnings: [],
        fileType: '.exe',
        riskLevel: 'critical' as const
      }]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const uploadArea = compiled.querySelector('.upload-area');

      expect(uploadArea?.classList.contains('error')).toBe(true);
    });

    it('should show warning state when there are warnings', () => {
      component.securityResults.set([{
        isValid: true,
        errors: [],
        warnings: ['Security warning'],
        fileType: '.jpg',
        riskLevel: 'medium' as const
      }]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const uploadArea = compiled.querySelector('.upload-area');

      expect(uploadArea?.classList.contains('warning')).toBe(true);
    });

    it('should show security results when available', () => {
      component.securityResults.set([{
        isValid: true,
        errors: [],
        warnings: ['Warning'],
        fileType: '.jpg',
        riskLevel: 'medium' as const
      }]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const securityResults = compiled.querySelector('.security-results');

      expect(securityResults).toBeTruthy();
    });

    it('should show upload actions when there are valid files', () => {
      component.selectedFiles.set([new File(['content'], 'test.jpg', { type: 'image/jpeg' })]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const uploadActions = compiled.querySelector('.upload-actions');

      expect(uploadActions).toBeTruthy();
    });

    it('should show security info section', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      const securityInfo = compiled.querySelector('.security-info');

      expect(securityInfo).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle security service errors gracefully', () => {
      fileSecurityService.validateFile.and.throwError('Security service error');
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      expect(() => component['processFiles']([file])).not.toThrow();
    });

    it('should handle file input errors', () => {
      expect(() => component.onFileSelect(new Event('change'))).not.toThrow();
    });

    it('should handle drag events with missing data', () => {
      const event = new DragEvent('drop', {
        preventDefault: () => {},
        stopPropagation: () => {}
      });

      expect(() => component.onDrop(event)).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const uploadArea = compiled.querySelector('.upload-area');

      expect(uploadArea?.getAttribute('role')).toBe('button');
      expect(uploadArea?.getAttribute('tabindex')).toBe('0');
    });

    it('should announce file validation results', () => {
      component.securityResults.set([{
        isValid: false,
        errors: ['File blocked'],
        warnings: [],
        fileType: '.exe',
        riskLevel: 'critical' as const
      }]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const errorElement = compiled.querySelector('.text-red-600');

      expect(errorElement?.textContent).toContain('Blocked');
    });
  });

  describe('Component Lifecycle', () => {
    it('should initialize correctly', () => {
      expect(component).toBeTruthy();
      expect(component.isDragOver()).toBe(false);
      expect(component.isUploading()).toBe(false);
    });
  });
});
