import { Injectable } from '@angular/core';

export interface FileSecurityResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityRule {
  name: string;
  description: string;
  blocked: boolean;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

@Injectable({
  providedIn: 'root'
})
export class FileSecurityService {
  
  // 🚫 DANGEROUS FILE EXTENSIONS - COMPLETE BLOCK
  private readonly DANGEROUS_EXTENSIONS = new Set([
    // Executables & Scripts
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.app',
    '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1', '.wsf', '.wsh', '.msi', '.msp',
    '.deb', '.rpm', '.dmg', '.pkg', '.appimage', '.snap', '.flatpak',
    
    // System Files
    '.sys', '.dll', '.ocx', '.cpl', '.drv', '.scf', '.lnk', '.url', '.library-ms',
    
    // Malware & Hacking Tools
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msc', '.application', '.gadget',
    '.ps1', '.ps1xml', '.ps2', '.ps2xml', '.psc1', '.psc2', '.msh', '.msh1', '.msh2',
    '.mshxml', '.msh1xml', '.msh2xml', '.scf', '.reg', '.rgs', '.inf', '.ins',
    '.isp', '.crt', '.cer', '.der', '.p7b', '.p7c', '.p12', '.pfx', '.pem',
    '.sst', '.stl', '.p7r', '.spc', '.crl', '.pki', '.p10', '.p7m', '.p7s',
    '.cat', '.root', '.spc', '.pvk', '.snk', '.pfx', '.p12', '.p7b', '.spc',
    
    // Boot & Firmware
    '.bin', '.img', '.iso', '.nrg', '.mdf', '.mds', '.cue', '.ccd', '.b5t', '.b6t',
    '.bwt', '.isz', '.daa', '.uif', '.asdm', '.bif', '.bif6', '.cdi', '.cif',
    '.c2d', '.dmg', '.dmgpart', '.dmg.sparse', '.dmg.sparseimage', '.dmg.cdr',
    '.dmg.udif', '.dmg.udif.zlib', '.dmg.udif.bzip2', '.dmg.udif.lzfse',
    '.dmg.udif.lzma', '.dmg.udif.lzvn', '.dmg.udif.adc', '.dmg.udif.compression',
    '.dmg.udif.encrypted', '.dmg.udif.password', '.dmg.udif.aes', '.dmg.udif.aes128',
    '.dmg.udif.aes256', '.dmg.udif.sha1', '.dmg.udif.sha256', '.dmg.udif.sha512',
    
    // Virtualization & Containers
    '.ova', '.ovf', '.vmdk', '.vdi', '.vhd', '.vhdx', '.vbox', '.qcow2', '.qcow',
    '.qed', '.raw', '.img', '.dsk', '.hdd', '.hds', '.vmsn', '.vmsd', '.vmem',
    '.vmss', '.vmxf', '.nvram', '.vmwarevm', '.parallels', '.pvm', '.hdd',
    '.hds', '.vmsn', '.vmsd', '.vmem', '.vmss', '.vmxf', '.nvram', '.vmwarevm',
    
    // Network & Security Tools
    '.pcap', '.pcapng', '.cap', '.dmp', '.dump', '.crash', '.mdmp', '.dmp',
    '.hdmp', '.wer', '.log', '.evt', '.evtx', '.etl', '.blg', '.pml', '.tlg',
    '.trace', '.out', '.stackdump', '.core', '.dmp', '.mdmp', '.hdmp', '.wer',
    
    // Database & Configuration
    '.sql', '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.dbf', '.dbc',
    '.frm', '.myd', '.myi', '.ibd', '.aria', '.trg', '.trn', '.opt', '.par',
    '.csm', '.csn', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.toml',
    '.ini', '.cfg', '.conf', '.config', '.properties', '.env', '.dotenv',
    
    // Archive & Compression (potentially malicious)
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lzma', '.lzo', '.lz4',
    '.zst', '.arj', '.ace', '.arc', '.arj', '.cab', '.lha', '.lzh', '.sit',
    '.sitx', '.tar.gz', '.tar.bz2', '.tar.xz', '.tar.lzma', '.tar.z', '.tar.Z',
    '.tgz', '.tbz2', '.txz', '.tlz', '.tz', '.tzst', '.tar.zst', '.tar.lz4',
    '.tar.lzo', '.tar.lrz', '.tar.lz', '.tar.lzma', '.tar.7z', '.tar.rar',
    
    // Document Macros (potentially malicious)
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    '.rtf', '.dot', '.dotx', '.dotm', '.xlsb', '.xlsm', '.xlt', '.xltm',
    '.xlam', '.pptm', '.pot', '.potm', '.ppam', '.ppsx', '.ppsm', '.sldm',
    '.sldx', '.thmx', '.vsdx', '.vsdm', '.vstx', '.vstm', '.vsdx', '.vsdm',
    
    // Media & Scripts (potentially malicious)
    '.swf', '.fla', '.flv', '.f4v', '.f4p', '.f4a', '.f4b', '.swc', '.sol',
    '.spl', '.rss', '.xml', '.xsl', '.xslt', '.xsd', '.xdr', '.xquery', '.xpath',
    '.xlink', '.xbase', '.xforms', '.xhtml', '.xhtml', '.xhtml+xml', '.xhtml+xml',
    '.xhtml+xml', '.xhtml+xml', '.xhtml+xml', '.xhtml+xml', '.xhtml+xml'
  ]);

  // ⚠️ RESTRICTED EXTENSIONS - ADMIN APPROVAL REQUIRED
  private readonly RESTRICTED_EXTENSIONS = new Set([
    // Office Documents with Macros
    '.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm', '.ppam', '.ppsm', '.sldm',
    
    // Scripts & Code (admin approval)
    '.py', '.rb', '.pl', '.php', '.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh',
    '.ksh', '.awk', '.sed', '.perl', '.python', '.ruby', '.lua', '.tcl', '.tk',
    '.expect', '.groovy', '.scala', '.kotlin', '.swift', '.go', '.rust', '.rs',
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.java', '.cs', '.vb',
    '.fs', '.fsx', '.ml', '.mli', '.hs', '.lhs', '.cl', '.lisp', '.el', '.emacs',
    '.vim', '.vimrc', '.gvimrc', '.exrc', '.viminfo', '.netrwhist', '.swp',
    '.swo', '.swn', '.bak', '.tmp', '.temp', '.old', '.orig', '.rej', '.diff',
    '.patch', '.ed', '.red', '.script', '.scriptlet', '.wsc', '.wsf', '.wsh',
    
    // Configuration Files (admin approval)
    '.htaccess', '.htpasswd', '.htgroup', '.htdigest', '.htuser', '.htgroup',
    '.htaccess', '.htpasswd', '.htgroup', '.htdigest', '.htuser', '.htgroup',
    '.htaccess', '.htpasswd', '.htgroup', '.htdigest', '.htuser', '.htgroup',
    
    // Development Tools (admin approval)
    '.dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
    'Makefile', 'makefile', 'makefile.am', 'makefile.in', 'configure', 'configure.ac',
    'config.guess', 'config.sub', 'config.h', 'config.h.in', 'config.status',
    'config.log', 'config.cache', 'config', 'configure', 'configure.ac',
    'config.guess', 'config.sub', 'config.h', 'config.h.in', 'config.status',
    'config.log', 'config.cache', 'Makefile.am', 'Makefile.in', 'Makefile',
    'makefile', 'makefile.am', 'makefile.in', 'configure', 'configure.ac',
    'config.guess', 'config.sub', 'config.h', 'config.h.in', 'config.status',
    'config.log', 'config.cache', 'build.xml', 'build.gradle', 'build.properties',
    'pom.xml', 'package.json', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json',
    'bower.json', '.bowerrc', '.npmrc', '.nvmrc', '.node-version', '.nvmrc',
    '.yarnrc', '.yarn-integrity', 'yarn.lock', 'pnpm-lock.yaml', '.pnpmfile',
    
    // Database Files (admin approval)
    '.sql', '.dump', '.backup', '.bak', '.old', '.orig', '.rej', '.diff',
    '.patch', '.ed', '.red', '.script', '.scriptlet', '.wsc', '.wsf', '.wsh'
  ]);

  // 📊 ALLOWED EXTENSIONS WITH SIZE LIMITS
  private readonly ALLOWED_EXTENSIONS = new Map([
    // Images
    ['.jpg', { maxSize: 10 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.jpeg', { maxSize: 10 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.png', { maxSize: 10 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.gif', { maxSize: 5 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.webp', { maxSize: 10 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.svg', { maxSize: 1 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.bmp', { maxSize: 10 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.tiff', { maxSize: 20 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.ico', { maxSize: 1 * 1024 * 1024, riskLevel: 'low' as const }],
    
    // Documents
    ['.pdf', { maxSize: 50 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.txt', { maxSize: 5 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.csv', { maxSize: 10 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.md', { maxSize: 5 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.rtf', { maxSize: 10 * 1024 * 1024, riskLevel: 'medium' as const }],
    
    // Audio
    ['.mp3', { maxSize: 50 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.wav', { maxSize: 100 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.flac', { maxSize: 100 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.aac', { maxSize: 50 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.ogg', { maxSize: 50 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.m4a', { maxSize: 50 * 1024 * 1024, riskLevel: 'low' as const }],
    
    // Video
    ['.mp4', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.avi', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.mov', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.wmv', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.flv', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.webm', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    ['.mkv', { maxSize: 500 * 1024 * 1024, riskLevel: 'low' as const }],
    
    // Archives (safe)
    ['.zip', { maxSize: 100 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.rar', { maxSize: 100 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.7z', { maxSize: 100 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.tar', { maxSize: 100 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.gz', { maxSize: 100 * 1024 * 1024, riskLevel: 'medium' as const }],
    
    // Office Documents (safe)
    ['.docx', { maxSize: 25 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.xlsx', { maxSize: 25 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.pptx', { maxSize: 50 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.odt', { maxSize: 25 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.ods', { maxSize: 25 * 1024 * 1024, riskLevel: 'medium' as const }],
    ['.odp', { maxSize: 50 * 1024 * 1024, riskLevel: 'medium' as const }]
  ]);

  // 🚨 SUSPICIOUS FILE NAMES
  private readonly SUSPICIOUS_NAMES = new Set([
    'readme', 'readme.txt', 'readme.md', 'readme.rst', 'readme.org',
    'install', 'setup', 'setup.exe', 'install.exe', 'install.msi',
    'run', 'run.exe', 'start', 'start.exe', 'launch', 'launch.exe',
    'admin', 'administrator', 'root', 'system', 'system32',
    'config', 'configuration', 'settings', 'options', 'preferences',
    'temp', 'tmp', 'temporary', 'cache', 'backup', 'restore',
    'hack', 'crack', 'patch', 'keygen', 'serial', 'license',
    'virus', 'malware', 'trojan', 'worm', 'spyware', 'adware',
    'bot', 'botnet', 'payload', 'exploit', 'shell', 'backdoor',
    'keylogger', 'stealer', 'rat', 'c2', 'cnc', 'command',
    'dropper', 'loader', 'injector', 'packer', 'cryptor', 'obfuscator',
    'autorun', 'autostart', 'startup', 'boot', 'bootloader',
    'driver', 'service', 'daemon', 'process', 'thread', 'memory',
    'registry', 'regedit', 'reg', 'ini', 'cfg', 'conf', 'config',
    'log', 'debug', 'trace', 'dump', 'crash', 'error', 'exception',
    'temp', 'tmp', 'cache', 'cookies', 'history', 'bookmarks',
    'password', 'pass', 'pwd', 'secret', 'key', 'private', 'public',
    'ssh', 'rsa', 'dsa', 'ecdsa', 'ed25519', 'pgp', 'gpg', 'ssl', 'tls',
    'cert', 'certificate', 'ca', 'certificate-authority', 'certificate-chain'
  ]);

  // 📊 FILE SIZE LIMITS
  private readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB default
  private readonly MAX_FILENAME_LENGTH = 255;
  private readonly MAX_PATH_LENGTH = 4096;

  constructor() { }

  /**
   * Validates file security and returns detailed results
   */
  validateFile(file: File, filePath?: string): FileSecurityResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fileName = file.name.toLowerCase();
    const fileExtension = this.getFileExtension(fileName);
    const fileSize = file.size;

    // Check file size
    if (fileSize > this.MAX_FILE_SIZE) {
      errors.push(`File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(this.MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB`);
    }

    // Check filename length
    if (fileName.length > this.MAX_FILENAME_LENGTH) {
      errors.push(`Filename length ${fileName.length} exceeds maximum allowed length of ${this.MAX_FILENAME_LENGTH} characters`);
    }

    // Check path length
    if (filePath && filePath.length > this.MAX_PATH_LENGTH) {
      errors.push(`File path length ${filePath.length} exceeds maximum allowed length of ${this.MAX_PATH_LENGTH} characters`);
    }

    // Check for dangerous extensions
    if (this.DANGEROUS_EXTENSIONS.has(fileExtension)) {
      errors.push(`File extension '${fileExtension}' is blocked for security reasons. This file type can be used to execute malicious code.`);
      return {
        isValid: false,
        errors,
        warnings,
        fileType: fileExtension,
        riskLevel: 'critical'
      };
    }

    // Check for restricted extensions
    if (this.RESTRICTED_EXTENSIONS.has(fileExtension)) {
      errors.push(`File extension '${fileExtension}' requires administrator approval. This file type can potentially be used for malicious purposes.`);
      return {
        isValid: false,
        errors,
        warnings,
        fileType: fileExtension,
        riskLevel: 'high'
      };
    }

    // Check if extension is allowed
    const allowedConfig = this.ALLOWED_EXTENSIONS.get(fileExtension);
    if (!allowedConfig) {
      errors.push(`File extension '${fileExtension}' is not allowed. Only specific file types are permitted for security reasons.`);
      return {
        isValid: false,
        errors,
        warnings,
        fileType: fileExtension,
        riskLevel: 'high'
      };
    }

    // Check file size for specific extension
    if (fileSize > allowedConfig.maxSize) {
      errors.push(`File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size for ${fileExtension} files of ${(allowedConfig.maxSize / 1024 / 1024).toFixed(2)}MB`);
      return {
        isValid: false,
        errors,
        warnings,
        fileType: fileExtension,
        riskLevel: 'medium'
      };
    }

    // Check for suspicious filenames
    const baseName = this.getBaseFileName(fileName);
    if (this.SUSPICIOUS_NAMES.has(baseName)) {
      warnings.push(`Filename '${baseName}' is suspicious and may indicate malicious intent. Please verify the file contents.`);
    }

    // Check for double extensions
    if (this.hasDoubleExtension(fileName)) {
      warnings.push(`File has double extension which is commonly used to hide malicious files. Please verify the file contents.`);
    }

    // Check for special characters in filename
    if (this.hasSuspiciousCharacters(fileName)) {
      warnings.push(`Filename contains special characters that may be used for obfuscation. Please verify the file contents.`);
    }

    // Check for hidden files
    if (fileName.startsWith('.') || fileName.startsWith('..')) {
      warnings.push(`Hidden or system files may pose security risks. Please verify the file contents.`);
    }

    // Check for executable patterns in filename
    if (this.hasExecutablePattern(fileName)) {
      warnings.push(`Filename pattern suggests executable content. Please verify the file contents.`);
    }

    const riskLevel = this.calculateRiskLevel(errors, warnings, allowedConfig.riskLevel);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileType: fileExtension,
      riskLevel
    };
  }

  /**
   * Quick validation for file selection
   */
  isFileAllowed(file: File): boolean {
    const result = this.validateFile(file);
    return result.isValid;
  }

  /**
   * Get security rules for display
   */
  getSecurityRules(): SecurityRule[] {
    return [
      {
        name: 'Dangerous Files',
        description: 'Executables, scripts, and system files that can execute malicious code',
        blocked: true,
        reason: 'These file types can execute arbitrary code and compromise system security',
        riskLevel: 'critical'
      },
      {
        name: 'Restricted Files',
        description: 'Code files, configuration files, and development tools',
        blocked: true,
        reason: 'These files require administrator approval due to potential security risks',
        riskLevel: 'high'
      },
      {
        name: 'File Size Limits',
        description: 'Maximum file size restrictions based on file type',
        blocked: false,
        reason: 'Large files can consume excessive resources and may contain malicious content',
        riskLevel: 'medium'
      },
      {
        name: 'Filename Restrictions',
        description: 'Suspicious filenames and patterns are flagged',
        blocked: false,
        reason: 'Suspicious filenames may indicate malicious intent or obfuscation',
        riskLevel: 'medium'
      }
    ];
  }

  /**
   * Get allowed file extensions
   */
  getAllowedExtensions(): string[] {
    return Array.from(this.ALLOWED_EXTENSIONS.keys());
  }

  /**
   * Get maximum file size for extension
   */
  getMaxFileSize(extension: string): number {
    const config = this.ALLOWED_EXTENSIONS.get(extension.toLowerCase());
    return config ? config.maxSize : this.MAX_FILE_SIZE;
  }

  /**
   * Check if extension is dangerous
   */
  isDangerousExtension(extension: string): boolean {
    return this.DANGEROUS_EXTENSIONS.has(extension.toLowerCase());
  }

  /**
   * Check if extension is restricted
   */
  isRestrictedExtension(extension: string): boolean {
    return this.RESTRICTED_EXTENSIONS.has(extension.toLowerCase());
  }

  /**
   * Check if extension is allowed
   */
  isAllowedExtension(extension: string): boolean {
    return this.ALLOWED_EXTENSIONS.has(extension.toLowerCase());
  }

  // Private helper methods
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : '';
  }

  private getBaseFileName(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
    const start = lastSlash + 1;
    const end = lastDot !== -1 ? lastDot : fileName.length;
    return fileName.substring(start, end);
  }

  private hasDoubleExtension(fileName: string): boolean {
    const parts = fileName.split('.');
    return parts.length > 2 && parts.slice(1, -1).some(part => part.length <= 3);
  }

  private hasSuspiciousCharacters(fileName: string): boolean {
    const suspiciousChars = /[<>:"|?*\x00-\x1f]/;
    return suspiciousChars.test(fileName);
  }

  private hasExecutablePattern(fileName: string): boolean {
    const executablePatterns = [
      /setup/i, /install/i, /run/i, /start/i, /launch/i,
      /admin/i, /system/i, /config/i, /temp/i, /hack/i,
      /crack/i, /patch/i, /keygen/i, /serial/i, /license/i,
      /virus/i, /malware/i, /trojan/i, /worm/i, /spyware/i
    ];
    return executablePatterns.some(pattern => pattern.test(fileName));
  }

  private calculateRiskLevel(errors: string[], warnings: string[], baseRiskLevel: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
    if (errors.length > 0) {
      return 'critical';
    }
    if (warnings.length > 2) {
      return 'high';
    }
    if (warnings.length > 0) {
      return 'medium';
    }
    return baseRiskLevel;
  }
}
