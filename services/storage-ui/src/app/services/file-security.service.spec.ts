import { TestBed } from '@angular/core/testing';
import { FileSecurityService, FileSecurityResult } from './file-security.service';

describe('FileSecurityService', () => {
  let service: FileSecurityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileSecurityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Dangerous File Extensions', () => {
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
      '.ps1', '.msi', '.deb', '.rpm', '.dmg', '.pkg', '.sys', '.dll',
      '.bin', '.img', '.iso', '.ova', '.ovf', '.vmdk', '.pcap', '.sql',
      '.zip', '.rar', '.7z', '.doc', '.xls', '.ppt', '.swf', '.fla'
    ];

    dangerousExtensions.forEach(extension => {
      it(`should block ${extension} files`, () => {
        const file = new File(['content'], `test${extension}`, { type: 'application/octet-stream' });
        const result = service.validateFile(file);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`File extension '${extension}' is blocked for security reasons. This file type can be used to execute malicious code.`);
        expect(result.riskLevel).toBe('critical');
      });
    });

    it('should identify dangerous extensions correctly', () => {
      expect(service.isDangerousExtension('.exe')).toBe(true);
      expect(service.isDangerousExtension('.bat')).toBe(true);
      expect(service.isDangerousExtension('.js')).toBe(true);
      expect(service.isDangerousExtension('.zip')).toBe(true);
      expect(service.isDangerousExtension('.doc')).toBe(true);
    });
  });

  describe('Restricted File Extensions', () => {
    const restrictedExtensions = [
      '.docm', '.xlsm', '.pptm', '.py', '.rb', '.pl', '.php', '.sh',
      '.dockerfile', 'Makefile', '.htaccess', '.sql', '.dump'
    ];

    restrictedExtensions.forEach(extension => {
      it(`should restrict ${extension} files`, () => {
        const file = new File(['content'], `test${extension}`, { type: 'text/plain' });
        const result = service.validateFile(file);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(`File extension '${extension}' requires administrator approval. This file type can potentially be used for malicious purposes.`);
        expect(result.riskLevel).toBe('high');
      });
    });

    it('should identify restricted extensions correctly', () => {
      expect(service.isRestrictedExtension('.docm')).toBe(true);
      expect(service.isRestrictedExtension('.py')).toBe(true);
      expect(service.isRestrictedExtension('.sh')).toBe(true);
      expect(service.isRestrictedExtension('.dockerfile')).toBe(true);
    });
  });

  describe('Allowed File Extensions', () => {
    const allowedFiles = [
      { ext: '.jpg', size: 1024 * 1024, risk: 'low' },
      { ext: '.png', size: 2 * 1024 * 1024, risk: 'low' },
      { ext: '.pdf', size: 10 * 1024 * 1024, risk: 'medium' },
      { ext: '.mp4', size: 100 * 1024 * 1024, risk: 'low' },
      { ext: '.docx', size: 5 * 1024 * 1024, risk: 'medium' }
    ];

    allowedFiles.forEach(({ ext, size, risk }) => {
      it(`should allow ${ext} files within size limit`, () => {
        const file = new File(['content'], `test${ext}`, { type: 'application/octet-stream' });
        Object.defineProperty(file, 'size', { value: size });
        
        const result = service.validateFile(file);

        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(0);
        expect(result.riskLevel).toBe(risk);
      });
    });

    it('should identify allowed extensions correctly', () => {
      expect(service.isAllowedExtension('.jpg')).toBe(true);
      expect(service.isAllowedExtension('.png')).toBe(true);
      expect(service.isAllowedExtension('.pdf')).toBe(true);
      expect(service.isAllowedExtension('.mp4')).toBe(true);
      expect(service.isAllowedExtension('.docx')).toBe(true);
    });
  });

  describe('File Size Validation', () => {
    it('should block files exceeding maximum size', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 }); // 600MB

      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File size 600.00MB exceeds maximum allowed size of 500.00MB');
    });

    it('should block files exceeding extension-specific size limit', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 15 * 1024 * 1024 }); // 15MB (exceeds 10MB limit for JPG)

      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File size 15.00MB exceeds maximum allowed size for .jpg files of 10.00MB');
    });

    it('should allow files within size limits', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 }); // 5MB

      const result = service.validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('Filename Validation', () => {
    it('should block filenames exceeding maximum length', () => {
      const longName = 'a'.repeat(260);
      const file = new File(['content'], `${longName}.jpg`, { type: 'image/jpeg' });

      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(`Filename length 265 exceeds maximum allowed length of 255 characters`);
    });

    it('should block file paths exceeding maximum length', () => {
      const longPath = 'a'.repeat(4100);
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      const result = service.validateFile(file, longPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(`File path length 4100 exceeds maximum allowed length of 4096 characters`);
    });

    it('should warn about suspicious filenames', () => {
      const suspiciousNames = ['readme.txt', 'setup.exe', 'hack.bat', 'admin.dll'];
      
      suspiciousNames.forEach(filename => {
        const file = new File(['content'], filename, { type: 'application/octet-stream' });
        const result = service.validateFile(file);

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('suspicious'))).toBe(true);
      });
    });

    it('should warn about double extensions', () => {
      const file = new File(['content'], 'photo.jpg.exe', { type: 'application/octet-stream' });
      const result = service.validateFile(file);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('double extension'))).toBe(true);
    });

    it('should warn about suspicious characters', () => {
      const file = new File(['content'], 'test<file>.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('special characters'))).toBe(true);
    });

    it('should warn about hidden files', () => {
      const file = new File(['content'], '.hidden.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Hidden'))).toBe(true);
    });

    it('should warn about executable patterns', () => {
      const file = new File(['content'], 'installer.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('executable'))).toBe(true);
    });
  });

  describe('Unknown File Extensions', () => {
    it('should block unknown file extensions', () => {
      const file = new File(['content'], 'test.unknown', { type: 'application/octet-stream' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("File extension '.unknown' is not allowed. Only specific file types are permitted for security reasons.");
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('Risk Level Calculation', () => {
    it('should return critical risk for dangerous files', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      const result = service.validateFile(file);

      expect(result.riskLevel).toBe('critical');
    });

    it('should return high risk for restricted files', () => {
      const file = new File(['content'], 'test.py', { type: 'text/plain' });
      const result = service.validateFile(file);

      expect(result.riskLevel).toBe('high');
    });

    it('should return medium risk for files with warnings', () => {
      const file = new File(['content'], 'setup.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.riskLevel).toBe('medium');
    });

    it('should return low risk for safe files', () => {
      const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.riskLevel).toBe('low');
    });
  });

  describe('Utility Methods', () => {
    it('should return allowed extensions', () => {
      const extensions = service.getAllowedExtensions();
      
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.png');
      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.mp4');
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('should return maximum file size for extension', () => {
      const jpgSize = service.getMaxFileSize('.jpg');
      const pngSize = service.getMaxFileSize('.png');
      const pdfSize = service.getMaxFileSize('.pdf');

      expect(jpgSize).toBe(10 * 1024 * 1024); // 10MB
      expect(pngSize).toBe(10 * 1024 * 1024); // 10MB
      expect(pdfSize).toBe(50 * 1024 * 1024); // 50MB
    });

    it('should return default max size for unknown extension', () => {
      const defaultSize = service.getMaxFileSize('.unknown');
      expect(defaultSize).toBe(500 * 1024 * 1024); // 500MB
    });

    it('should return security rules', () => {
      const rules = service.getSecurityRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].name).toBeDefined();
      expect(rules[0].description).toBeDefined();
      expect(rules[0].blocked).toBeDefined();
      expect(rules[0].reason).toBeDefined();
      expect(rules[0].riskLevel).toBeDefined();
    });
  });

  describe('Quick Validation', () => {
    it('should return true for allowed files', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      expect(service.isFileAllowed(file)).toBe(true);
    });

    it('should return false for blocked files', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      expect(service.isFileAllowed(file)).toBe(false);
    });

    it('should return false for oversized files', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 });
      expect(service.isFileAllowed(file)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files without extensions', () => {
      const file = new File(['content'], 'testfile', { type: 'application/octet-stream' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("File extension '' is not allowed. Only specific file types are permitted for security reasons.");
    });

    it('should handle empty filenames', () => {
      const file = new File(['content'], '', { type: 'application/octet-stream' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("File extension '' is not allowed. Only specific file types are permitted for security reasons.");
    });

    it('should handle case insensitive extensions', () => {
      const file = new File(['content'], 'test.JPG', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('.jpg');
    });

    it('should handle files with multiple dots', () => {
      const file = new File(['content'], 'my.photo.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('.jpg');
    });

    it('should handle zero-size files', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Security Validation Results', () => {
    it('should return complete validation result structure', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const result = service.validateFile(file);

      expect(result.isValid).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.fileType).toBe('string');
      expect(typeof result.riskLevel).toBe('string');
      
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.fileType).toBe('string');
      expect(typeof result.riskLevel).toBe('string');
    });
  });
});
