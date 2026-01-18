import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { S3Service, S3Bucket, S3Object } from '../../services/s3.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-s3-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="s3-browser">
      <div class="browser-header">
        <h5>📦 S3 Browser</h5>
        <div class="header-actions">
          <button class="btn btn-sm btn-primary" (click)="refreshBuckets()">
            🔄 Refresh
          </button>
          <button class="btn btn-sm btn-success" (click)="showCreateBucketModal = true">
            ➕ Create Bucket
          </button>
        </div>
      </div>

      <!-- Bucket List -->
      <div class="bucket-section" *ngIf="!selectedBucket">
        <h6>Buckets</h6>
        <div class="bucket-list">
          <div 
            *ngFor="let bucket of buckets" 
            class="bucket-item"
            (click)="selectBucket(bucket)">
            <div class="bucket-icon">📦</div>
            <div class="bucket-info">
              <div class="bucket-name">{{ bucket.Name }}</div>
              <div class="bucket-date">Created: {{ formatDate(bucket.CreationDate) }}</div>
            </div>
            <div class="bucket-actions">
              <button class="btn btn-sm btn-outline-danger" (click)="deleteBucket(bucket.Name); $event.stopPropagation()">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <div class="empty-state" *ngIf="buckets.length === 0 && !loading">
          <div class="empty-icon">📦</div>
          <h6>No Buckets Found</h6>
          <p>Create your first bucket to get started with S3 storage.</p>
          <button class="btn btn-primary" (click)="showCreateBucketModal = true">
            Create Bucket
          </button>
        </div>

        <div class="loading-state" *ngIf="loading">
          <div class="spinner"></div>
          <p>Loading buckets...</p>
        </div>
      </div>

      <!-- Object List -->
      <div class="object-section" *ngIf="selectedBucket">
        <div class="section-header">
          <button class="btn btn-sm btn-outline-secondary" (click)="backToBuckets()">
            ← Back to Buckets
          </button>
          <h6>{{ selectedBucket.Name }}</h6>
          <div class="header-actions">
            <input 
              type="text" 
              class="form-control form-control-sm" 
              placeholder="Search objects..." 
              [(ngModel)]="searchQuery"
              (input)="filterObjects()">
            <button class="btn btn-sm btn-primary" (click)="refreshObjects()">
              🔄 Refresh
            </button>
            <button class="btn btn-sm btn-success" (click)="showUploadModal = true">
              ⬆️ Upload
            </button>
          </div>
        </div>

        <div class="breadcrumb">
          <span class="breadcrumb-item" (click)="navigateToPath('')">🏠 Root</span>
          <span *ngFor="let part of pathParts; let last = last" class="breadcrumb-item">
            <span *ngIf="!last"> / </span>
            <span (click)="navigateToPath(getPathUpTo(part))">{{ part }}</span>
            <span *ngIf="last"> / {{ part }}</span>
          </span>
        </div>

        <div class="object-list">
          <!-- Folders -->
          <div 
            *ngFor="let folder of folders" 
            class="object-item folder"
            (click)="navigateToFolder(folder)">
            <div class="object-icon">📁</div>
            <div class="object-info">
              <div class="object-name">{{ folder }}</div>
              <div class="object-meta">Folder</div>
            </div>
          </div>

          <!-- Files -->
          <div 
            *ngFor="let object of filteredObjects" 
            class="object-item"
            (click)="selectObject(object)">
            <div class="object-icon">{{ getFileIcon(object.Key) }}</div>
            <div class="object-info">
              <div class="object-name">{{ getObjectName(object.Key) }}</div>
              <div class="object-meta">
                {{ formatFileSize(object.Size) }} • {{ formatDate(object.LastModified) }}
              </div>
            </div>
            <div class="object-actions">
              <button class="btn btn-sm btn-outline-primary" (click)="downloadObject(object); $event.stopPropagation()">
                ⬇️
              </button>
              <button class="btn btn-sm btn-outline-info" (click)="showObjectInfo(object); $event.stopPropagation()">
                ℹ️
              </button>
              <button class="btn btn-sm btn-outline-danger" (click)="deleteObject(object); $event.stopPropagation()">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <div class="empty-state" *ngIf="filteredObjects.length === 0 && folders.length === 0 && !loading">
          <div class="empty-icon">📄</div>
          <h6>No Objects Found</h6>
          <p>This folder is empty. Upload some files to get started.</p>
          <button class="btn btn-primary" (click)="showUploadModal = true">
            Upload Files
          </button>
        </div>
      </div>

      <!-- Create Bucket Modal -->
      <div class="modal-overlay" *ngIf="showCreateBucketModal" (click)="showCreateBucketModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h6>Create New Bucket</h6>
            <button class="btn-close" (click)="showCreateBucketModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Bucket Name</label>
              <input 
                type="text" 
                class="form-control" 
                [(ngModel)]="newBucketName"
                placeholder="Enter bucket name">
            </div>
            <div class="form-group">
              <label>Region</label>
              <select class="form-control" [(ngModel)]="newBucketRegion">
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="eu-west-1">EU West (Ireland)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCreateBucketModal = false">Cancel</button>
            <button class="btn btn-primary" (click)="createBucket()">Create Bucket</button>
          </div>
        </div>
      </div>

      <!-- Upload Modal -->
      <div class="modal-overlay" *ngIf="showUploadModal" (click)="showUploadModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h6>Upload Files</h6>
            <button class="btn-close" (click)="showUploadModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="upload-area" 
                 [class.drag-over]="dragOver"
                 (dragover)="dragOver = true; $event.preventDefault()"
                 (dragleave)="dragOver = false; $event.preventDefault()"
                 (drop)="handleFileDrop($event)">
              <div class="upload-icon">📁</div>
              <h6>Drop files here or click to browse</h6>
              <input 
                type="file" 
                multiple 
                (change)="handleFileSelect($event)"
                #fileInput>
              <button class="btn btn-outline-primary" (click)="fileInput.click()">
                Browse Files
              </button>
            </div>
            <div class="upload-list" *ngIf="selectedFiles.length > 0">
              <h6>Selected Files</h6>
              <div *ngFor="let file of selectedFiles" class="upload-item">
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <button class="btn btn-sm btn-outline-danger" (click)="removeFile(file)">×</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showUploadModal = false">Cancel</button>
            <button class="btn btn-primary" (click)="uploadFiles()" [disabled]="selectedFiles.length === 0">
              Upload ({{ selectedFiles.length }})
            </button>
          </div>
        </div>
      </div>

      <!-- Object Info Modal -->
      <div class="modal-overlay" *ngIf="showInfoModal" (click)="showInfoModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h6>Object Information</h6>
            <button class="btn-close" (click)="showInfoModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="info-grid">
              <div class="info-item">
                <label>Key</label>
                <span>{{ selectedObject?.Key }}</span>
              </div>
              <div class="info-item">
                <label>Size</label>
                <span>{{ selectedObject ? formatFileSize(selectedObject.Size) : '' }}</span>
              </div>
              <div class="info-item">
                <label>Last Modified</label>
                <span>{{ selectedObject ? formatDate(selectedObject.LastModified) : '' }}</span>
              </div>
              <div class="info-item">
                <label>ETag</label>
                <span>{{ selectedObject?.ETag }}</span>
              </div>
              <div class="info-item">
                <label>Storage Class</label>
                <span>{{ selectedObject?.StorageClass }}</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showInfoModal = false">Close</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .s3-browser {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .browser-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .browser-header h5 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .bucket-list, .object-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bucket-item, .object-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .bucket-item:hover, .object-item:hover {
      background-color: #f9fafb;
      border-color: #3b82f6;
    }

    .object-item.folder {
      background-color: #f0f9ff;
      border-color: #3b82f6;
    }

    .bucket-icon, .object-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .bucket-info, .object-info {
      flex: 1;
      min-width: 0;
    }

    .bucket-name, .object-name {
      font-weight: 500;
      margin-bottom: 2px;
    }

    .bucket-date, .object-meta {
      font-size: 12px;
      color: #6b7280;
    }

    .bucket-actions, .object-actions {
      display: flex;
      gap: 4px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .section-header h6 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 16px;
      font-size: 14px;
      flex-wrap: wrap;
    }

    .breadcrumb-item {
      color: #3b82f6;
      cursor: pointer;
    }

    .breadcrumb-item:hover {
      text-decoration: underline;
    }

    .empty-state, .loading-state {
      text-align: center;
      padding: 40px 20px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h6 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .empty-state p {
      margin: 0 0 20px 0;
      color: #6b7280;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e5e7eb;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .modal-header h6 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
      font-weight: 500;
    }

    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s ease;
    }

    .upload-area:hover, .upload-area.drag-over {
      border-color: #3b82f6;
      background-color: #f0f9ff;
    }

    .upload-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .upload-area input[type="file"] {
      display: none;
    }

    .upload-list {
      margin-top: 20px;
    }

    .upload-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background-color: #f9fafb;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .file-size {
      font-size: 12px;
      color: #6b7280;
    }

    .info-grid {
      display: grid;
      gap: 12px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .info-item label {
      font-weight: 500;
      color: #374151;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }

    @media (max-width: 768px) {
      .browser-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .section-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `]
})
export class S3BrowserComponent implements OnInit, OnDestroy {
  buckets: S3Bucket[] = [];
  objects: S3Object[] = [];
  filteredObjects: S3Object[] = [];
  folders: string[] = [];
  
  selectedBucket: S3Bucket | null = null;
  selectedObject: S3Object | null = null;
  
  currentPath: string = '';
  pathParts: string[] = [];
  searchQuery: string = '';
  
  loading: boolean = false;
  
  // Modal states
  showCreateBucketModal: boolean = false;
  showUploadModal: boolean = false;
  showInfoModal: boolean = false;
  
  // Form data
  newBucketName: string = '';
  newBucketRegion: string = 'us-east-1';
  selectedFiles: File[] = [];
  dragOver: boolean = false;
  
  private subscriptions: Subscription[] = [];

  constructor(private s3Service: S3Service) {}

  ngOnInit(): void {
    this.refreshBuckets();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  refreshBuckets(): void {
    this.loading = true;
    const sub = this.s3Service.listBuckets().subscribe({
      next: (buckets) => {
        this.buckets = buckets;
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Failed to load buckets:', error);
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  selectBucket(bucket: S3Bucket): void {
    this.selectedBucket = bucket;
    this.currentPath = '';
    this.pathParts = [];
    this.refreshObjects();
  }

  backToBuckets(): void {
    this.selectedBucket = null;
    this.objects = [];
    this.filteredObjects = [];
    this.folders = [];
  }

  refreshObjects(): void {
    if (!this.selectedBucket) return;
    
    this.loading = true;
    const options: any = {};
    if (this.currentPath) {
      options.prefix = this.currentPath;
      options.delimiter = '/';
    }

    const sub = this.s3Service.listObjects(this.selectedBucket.Name, options).subscribe({
      next: (objects) => {
        this.objects = objects;
        this.extractFolders();
        this.filterObjects();
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Failed to load objects:', error);
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  extractFolders(): void {
    const folderSet = new Set<string>();
    
    this.objects.forEach(obj => {
      if (obj.Key.includes('/')) {
        const parts = obj.Key.split('/');
        if (parts.length > 1) {
          const folder = parts[0];
          if (this.currentPath) {
            if (obj.Key.startsWith(this.currentPath + '/')) {
              const relativePath = obj.Key.substring(this.currentPath.length + 1);
              const folderName = relativePath.split('/')[0];
              if (folderName) folderSet.add(folderName);
            }
          } else {
            folderSet.add(folder);
          }
        }
      }
    });
    
    this.folders = Array.from(folderSet).sort();
  }

  filterObjects(): void {
    if (!this.searchQuery) {
      this.filteredObjects = this.objects.filter(obj => !obj.Key.includes('/'));
      return;
    }

    this.filteredObjects = this.objects.filter(obj => 
      !obj.Key.includes('/') && 
      obj.Key.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
  }

  navigateToFolder(folder: string): void {
    const newPath = this.currentPath ? `${this.currentPath}/${folder}` : folder;
    this.navigateToPath(newPath);
  }

  navigateToPath(path: string): void {
    this.currentPath = path;
    this.pathParts = path ? path.split('/') : [];
    this.refreshObjects();
  }

  getPathUpTo(part: string): string {
    const index = this.pathParts.indexOf(part);
    if (index >= 0) {
      return this.pathParts.slice(0, index + 1).join('/');
    }
    return '';
  }

  createBucket(): void {
    if (!this.newBucketName.trim()) return;

    const sub = this.s3Service.createBucket(this.newBucketName, this.newBucketRegion).subscribe({
      next: () => {
        this.showCreateBucketModal = false;
        this.newBucketName = '';
        this.refreshBuckets();
      },
      error: (error: any) => {
        console.error('Failed to create bucket:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  deleteBucket(bucketName: string): void {
    if (!confirm(`Are you sure you want to delete bucket "${bucketName}"?`)) return;

    const sub = this.s3Service.deleteBucket(bucketName).subscribe({
      next: () => {
        this.refreshBuckets();
      },
      error: (error: any) => {
        console.error('Failed to delete bucket:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  selectObject(object: S3Object): void {
    this.selectedObject = object;
  }

  downloadObject(object: S3Object): void {
    const sub = this.s3Service.getObject(this.selectedBucket!.Name, object.Key).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.getObjectName(object.Key);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error: any) => {
        console.error('Failed to download object:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  deleteObject(object: S3Object): void {
    if (!confirm(`Are you sure you want to delete "${this.getObjectName(object.Key)}"?`)) return;

    const sub = this.s3Service.deleteObject(this.selectedBucket!.Name, object.Key).subscribe({
      next: () => {
        this.refreshObjects();
      },
      error: (error: any) => {
        console.error('Failed to delete object:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  showObjectInfo(object: S3Object): void {
    this.selectedObject = object;
    this.showInfoModal = true;
  }

  handleFileSelect(event: any): void {
    const files = Array.from(event.target.files) as File[];
    this.selectedFiles = [...this.selectedFiles, ...files];
  }

  handleFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    
    if (event.dataTransfer?.files) {
      const files = Array.from(event.dataTransfer.files) as File[];
      this.selectedFiles = [...this.selectedFiles, ...files];
    }
  }

  removeFile(file: File): void {
    this.selectedFiles = this.selectedFiles.filter(f => f !== file);
  }

  uploadFiles(): void {
    if (this.selectedFiles.length === 0 || !this.selectedBucket) return;

    this.selectedFiles.forEach(file => {
      const key = this.currentPath ? `${this.currentPath}/${file.name}` : file.name;
      const sub = this.s3Service.putObject(this.selectedBucket!.Name, key, file).subscribe({
        next: () => {
          console.log(`Uploaded ${file.name}`);
        },
        error: (error: any) => {
          console.error(`Failed to upload ${file.name}:`, error);
        }
      });
      this.subscriptions.push(sub);
    });

    this.showUploadModal = false;
    this.selectedFiles = [];
    setTimeout(() => this.refreshObjects(), 1000);
  }

  // Utility methods
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getObjectName(key: string): string {
    return key.split('/').pop() || key;
  }

  getFileIcon(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'pdf': '📄',
      'doc': '📝', 'docx': '📝',
      'xls': '📊', 'xlsx': '📊',
      'ppt': '📽️', 'pptx': '📽️',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
      'mp3': '🎵', 'wav': '🎵',
      'zip': '📦', 'rar': '📦',
      'txt': '📄', 'md': '📄'
    };
    return iconMap[ext || ''] || '📄';
  }
}
