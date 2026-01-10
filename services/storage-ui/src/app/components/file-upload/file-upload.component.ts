import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileSecurityService, FileSecurityResult } from '../../services/file-security.service';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="file-upload-container">
      <div class="upload-area" 
           [class.drag-over]="isDragOver()"
           [class.error]="hasErrors()"
           [class.warning]="hasWarnings()"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onDrop($event)"
           (click)="fileInput.click()">
        
        <div class="upload-content">
          <div class="upload-icon">
            @if (hasErrors()) {
              <svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            } @else if (hasWarnings()) {
              <svg class="w-12 h-12 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            } @else {
              <svg class="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
            }
          </div>
          
          <div class="upload-text">
            <h3 class="text-lg font-semibold mb-2">
              @if (hasErrors()) {
                Upload Failed - Security Issues Detected
              } @else if (hasWarnings()) {
                Upload with Warnings
              } @else {
                Upload Files
              }
            </h3>
            
            <p class="text-sm text-gray-600 mb-4">
              @if (hasErrors()) {
                Security validation failed. Please check the errors below.
              } @else if (hasWarnings()) {
                Files passed security check but have warnings. Review before proceeding.
              } @else {
                Drag and drop files here or click to browse
              }
            </p>
            
            <div class="file-types-info text-xs text-gray-500">
              <p class="mb-1">Allowed file types: {{ getAllowedFileTypes() }}</p>
              <p>Maximum file size: {{ getMaxFileSizeText() }}</p>
            </div>
          </div>
        </div>
        
        <input type="file" 
               #fileInput 
               [multiple]="multiple"
               (change)="onFileSelect($event)"
               class="hidden">
      </div>

      <!-- Security Validation Results -->
      @if (securityResults().length > 0) {
        <div class="security-results mt-4">
          @for (result of securityResults(); track result.fileType) {
            <div class="security-result mb-3 p-3 rounded-lg border"
                 [class.border-red-300]="!result.isValid"
                 [class.border-yellow-300]="result.isValid && result.warnings.length > 0"
                 [class.border-green-300]="result.isValid && result.warnings.length === 0">
              
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center">
                  <div class="risk-indicator mr-2">
                    @switch (result.riskLevel) {
                      @case ('critical') {
                        <span class="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
                      }
                      @case ('high') {
                        <span class="inline-block w-3 h-3 bg-orange-500 rounded-full"></span>
                      }
                      @case ('medium') {
                        <span class="inline-block w-3 h-3 bg-yellow-500 rounded-full"></span>
                      }
                      @case ('low') {
                        <span class="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
                      }
                    }
                  </div>
                  <div>
                    <span class="font-medium">{{ result.fileType.toUpperCase() }} File</span>
                    <span class="text-sm text-gray-500 ml-2">Risk: {{ result.riskLevel.toUpperCase() }}</span>
                  </div>
                </div>
                
                <div class="validation-status">
                  @if (result.isValid) {
                    <span class="text-green-600 text-sm">✓ Valid</span>
                  } @else {
                    <span class="text-red-600 text-sm">✗ Blocked</span>
                  }
                </div>
              </div>

              <!-- Errors -->
              @if (result.errors.length > 0) {
                <div class="errors mb-2">
                  @for (error of result.errors; track $index) {
                    <div class="text-sm text-red-600 flex items-start">
                      <span class="mr-1">•</span>
                      <span>{{ error }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Warnings -->
              @if (result.warnings.length > 0) {
                <div class="warnings">
                  @for (warning of result.warnings; track $index) {
                    <div class="text-sm text-yellow-600 flex items-start">
                      <span class="mr-1">⚠</span>
                      <span>{{ warning }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Upload Actions -->
      @if (hasValidFiles()) {
        <div class="upload-actions mt-4 flex gap-2">
          <button (click)="uploadFiles()" 
                  [disabled]="isUploading()"
                  class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
            @if (isUploading()) {
              Uploading...
            } @else {
              Upload {{ getValidFileCount() }} Files
            }
          </button>
          
          <button (click)="clearFiles()" 
                  class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
            Clear
          </button>
        </div>
      }

      <!-- Security Rules Info -->
      <div class="security-info mt-4 p-3 bg-gray-50 rounded-lg">
        <h4 class="font-medium mb-2">🔒 Security Rules Applied:</h4>
        <ul class="text-sm text-gray-600 space-y-1">
          <li>• Dangerous files (executables, scripts) are blocked</li>
          <li>• Restricted files require admin approval</li>
          <li>• File size limits enforced by type</li>
          <li>• Suspicious filenames are flagged</li>
          <li>• Double extensions are monitored</li>
        </ul>
        <button (click)="showSecurityDetails = !showSecurityDetails" 
                class="text-blue-500 text-sm mt-2 hover:underline">
          {{ showSecurityDetails ? 'Hide' : 'Show' }} Detailed Security Rules
        </button>
        
        @if (showSecurityDetails) {
          <div class="security-rules mt-2 p-2 bg-white rounded border">
            @for (rule of securityRules(); track rule.name) {
              <div class="rule-item mb-2 pb-2 border-b last:border-b-0">
                <div class="flex items-center justify-between">
                  <span class="font-medium">{{ rule.name }}</span>
                  <span class="text-xs px-2 py-1 rounded"
                        [class.bg-red-100]="rule.riskLevel === 'critical'"
                        [class.bg-orange-100]="rule.riskLevel === 'high'"
                        [class.bg-yellow-100]="rule.riskLevel === 'medium'"
                        [class.bg-green-100]="rule.riskLevel === 'low'">
                    {{ rule.riskLevel.toUpperCase() }}
                  </span>
                </div>
                <p class="text-sm text-gray-600 mt-1">{{ rule.description }}</p>
                <p class="text-xs text-gray-500 mt-1">{{ rule.reason }}</p>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .file-upload-container {
      max-width: 600px;
      margin: 0 auto;
    }

    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .upload-area:hover {
      border-color: #3b82f6;
      background-color: #f8fafc;
    }

    .upload-area.drag-over {
      border-color: #3b82f6;
      background-color: #eff6ff;
    }

    .upload-area.error {
      border-color: #ef4444;
      background-color: #fef2f2;
    }

    .upload-area.warning {
      border-color: #f59e0b;
      background-color: #fffbeb;
    }

    .upload-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .upload-icon {
      margin-bottom: 1rem;
    }

    .file-types-info {
      margin-top: 1rem;
      padding: 0.5rem;
      background-color: #f9fafb;
      border-radius: 4px;
    }

    .security-results {
      border-top: 1px solid #e5e7eb;
      padding-top: 1rem;
    }

    .security-result {
      background-color: white;
    }

    .risk-indicator {
      display: flex;
      align-items: center;
    }

    .validation-status {
      font-weight: 500;
    }

    .errors {
      background-color: #fef2f2;
      padding: 0.5rem;
      border-radius: 4px;
    }

    .warnings {
      background-color: #fffbeb;
      padding: 0.5rem;
      border-radius: 4px;
    }

    .upload-actions {
      display: flex;
      gap: 0.5rem;
    }

    .security-info {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
    }

    .security-rules {
      background-color: white;
      border: 1px solid #e5e7eb;
    }

    .rule-item:last-child {
      border-bottom: none;
    }

    .hidden {
      display: none;
    }
  `]
})
export class FileUploadComponent {
  @Input() multiple = true;
  @Input() maxFiles = 10;
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() uploadComplete = new EventEmitter<{ success: File[], failed: File[] }>();

  private fileSecurityService = new FileSecurityService();
  
  isDragOver = signal(false);
  isUploading = signal(false);
  securityResults = signal<FileSecurityResult[]>([]);
  selectedFiles = signal<File[]>([]);
  showSecurityDetails = signal(false);
  securityRules = signal(this.fileSecurityService.getSecurityRules());

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = Array.from(event.dataTransfer?.files || []);
    this.processFiles(files);
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.processFiles(files);
  }

  private processFiles(files: File[]): void {
    if (files.length > this.maxFiles) {
      alert(`Maximum ${this.maxFiles} files allowed. Selected ${files.length} files.`);
      return;
    }

    const results: FileSecurityResult[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const result = this.fileSecurityService.validateFile(file);
      results.push(result);
      
      if (result.isValid) {
        validFiles.push(file);
      }
    }

    this.securityResults.set(results);
    this.selectedFiles.set(validFiles);
    this.filesSelected.emit(validFiles);
  }

  uploadFiles(): void {
    if (this.selectedFiles().length === 0) {
      return;
    }

    this.isUploading.set(true);

    // Simulate upload process
    setTimeout(() => {
      const validFiles = this.selectedFiles();
      const failedFiles: File[] = [];

      // In a real implementation, this would upload to the server
      // For now, we'll simulate success for all valid files
      this.uploadComplete.emit({ 
        success: validFiles, 
        failed: failedFiles 
      });

      this.isUploading.set(false);
      this.clearFiles();
    }, 2000);
  }

  clearFiles(): void {
    this.selectedFiles.set([]);
    this.securityResults.set([]);
    
    // Clear file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  hasErrors(): boolean {
    return this.securityResults().some(result => !result.isValid);
  }

  hasWarnings(): boolean {
    return this.securityResults().some(result => result.warnings.length > 0);
  }

  hasValidFiles(): boolean {
    return this.selectedFiles().length > 0;
  }

  getValidFileCount(): number {
    return this.selectedFiles().length;
  }

  getAllowedFileTypes(): string {
    const extensions = this.fileSecurityService.getAllowedExtensions();
    return extensions.slice(0, 10).join(', ') + (extensions.length > 10 ? '...' : '');
  }

  getMaxFileSizeText(): string {
    const maxSize = 500 * 1024 * 1024; // 500MB
    return `${(maxSize / 1024 / 1024).toFixed(0)}MB`;
  }
}
