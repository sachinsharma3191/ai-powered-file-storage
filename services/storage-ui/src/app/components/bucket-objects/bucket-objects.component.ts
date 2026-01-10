import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StorageService, ListObjectsResponse, StorageObject, RateLimitInfo } from '../../services/storage.service';

@Component({
  selector: 'app-bucket-objects',
  standalone: true,
  template: `
    <div class="bucket-objects">
      <!-- Breadcrumb Navigation -->
      <div class="breadcrumb mb-4" *ngIf="currentPath">
        <button class="btn btn-sm btn-link p-0 me-2" (click)="navigateToPath('')">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          Home
        </button>
        <span class="text-muted">/</span>
        <ng-container *ngFor="let part of pathParts; let last = last">
          <button class="btn btn-sm btn-link p-0 mx-2" 
                  (click)="navigateToPath(getPathUpTo(part))" 
                  *ngIf="!last">
            {{ part }}
          </button>
          <span class="text-muted mx-2" *ngIf="last">{{ part }}</span>
          <span class="text-muted" *ngIf="!last">/</span>
        </ng-container>
      </div>

      <!-- Rate Limit Status -->
      <div class="alert alert-info d-flex align-items-center" *ngIf="rateLimitInfo">
        <svg class="w-4 h-4 me-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <small>
          API Rate Limit: {{ rateLimitInfo.remaining }}/{{ rateLimitInfo.limit }} requests remaining
          <span *ngIf="rateLimitInfo.reset > 0">(resets in {{ rateLimitInfo.reset }}s)</span>
        </small>
      </div>

      <!-- Toolbar -->
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="btn-group">
          <button class="btn btn-outline-primary btn-sm" (click)="createFolder()">
            <svg class="w-4 h-4 me-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22,19a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V5A2,2,0,0,1,4,3H9l2,3h9a2,2,0,0,1,2,2Z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            New Folder
          </button>
          <button class="btn btn-outline-primary btn-sm" (click)="uploadFile()">
            <svg class="w-4 h-4 me-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload File
          </button>
        </div>
        
        <div class="d-flex align-items-center">
          <input type="text" class="form-control form-control-sm me-2" 
                 placeholder="Search..." 
                 [(ngModel)]="searchTerm"
                 (input)="filterObjects()">
          <button class="btn btn-outline-secondary btn-sm" (click)="refresh()">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23,4 23,10 17,10"/>
              <path d="M20.49,15a9,9,0,1,1-2.12-9.36L23,10"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div class="text-center py-5" *ngIf="loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2 text-muted">Loading objects...</p>
      </div>

      <!-- Folders and Objects -->
      <div class="objects-container" *ngIf="!loading">
        <!-- Folders (Common Prefixes) -->
        <div class="folder-list mb-3" *ngIf="folders.length > 0">
          <h6 class="text-muted mb-2">Folders</h6>
          <div class="list-group">
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                 *ngFor="let folder of folders"
                 (click)="navigateToFolder(folder)">
              <div class="d-flex align-items-center">
                <svg class="w-5 h-5 me-2 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22,19a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V5A2,2,0,0,1,4,3H9l2,3h9a2,2,0,0,1,2,2Z"/>
                </svg>
                <span>{{ getFolderName(folder) }}</span>
              </div>
              <svg class="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Files -->
        <div class="file-list" *ngIf="filteredObjects.length > 0">
          <h6 class="text-muted mb-2" *ngIf="folders.length > 0">Files</h6>
          <div class="list-group">
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                 *ngFor="let object of filteredObjects"
                 (click)="selectObject(object)">
              <div class="d-flex align-items-center flex-grow-1">
                <svg class="w-5 h-5 me-2 text-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z"/>
                  <polyline points="14,2 14,8 20,8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10,9 9,9 8,9"/>
                </svg>
                <div class="flex-grow-1">
                  <div class="fw-medium">{{ getObjectName(object.key) }}</div>
                  <small class="text-muted">
                    {{ formatFileSize(object.size || 0) }} • 
                    {{ formatDate(object.updated_at) }}
                  </small>
                </div>
              </div>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-secondary dropdown-toggle" 
                        type="button" 
                        data-bs-toggle="dropdown">
                  Actions
                </button>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item" href="#" (click)="downloadObject(object)">Download</a></li>
                  <li><a class="dropdown-item" href="#" (click)="deleteObject(object)">Delete</a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item" href="#" (click)="showObjectDetails(object)">Details</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div class="text-center py-5" *ngIf="folders.length === 0 && filteredObjects.length === 0">
          <svg class="w-16 h-16 text-muted mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z"/>
            <polyline points="13,2 13,8 20,8"/>
          </svg>
          <h5 class="text-muted">This folder is empty</h5>
          <p class="text-muted">Upload files or create folders to get started</p>
          <button class="btn btn-primary" (click)="uploadFile()">Upload Files</button>
        </div>
      </div>

      <!-- Load More -->
      <div class="text-center mt-3" *ngIf="hasMore">
        <button class="btn btn-outline-primary" (click)="loadMore()" [disabled]="loadingMore">
          <span class="spinner-border spinner-border-sm me-2" *ngIf="loadingMore"></span>
          Load More
        </button>
      </div>
    </div>
  `,
  styles: [`
    .bucket-objects {
      padding: 1rem;
    }
    
    .breadcrumb {
      background: transparent;
      border: none;
      padding: 0;
    }
    
    .list-group-item {
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .list-group-item:hover {
      background-color: #f8f9fa;
    }
    
    .folder-list, .file-list {
      border: 1px solid #dee2e6;
      border-radius: 0.375rem;
      overflow: hidden;
    }
    
    .objects-container {
      min-height: 400px;
    }
  `]
})
export class BucketObjectsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  bucketName: string = '';
  objects: StorageObject[] = [];
  folders: string[] = [];
  filteredObjects: StorageObject[] = [];
  currentPath: string = '';
  pathParts: string[] = [];
  
  loading: boolean = false;
  loadingMore: boolean = false;
  hasMore: boolean = false;
  cursor?: string;
  
  searchTerm: string = '';
  rateLimitInfo?: RateLimitInfo;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private storageService: StorageService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params: any) => {
      this.bucketName = params['bucketName'];
      this.currentPath = params['path'] || '';
      this.updatePathParts();
      this.loadObjects();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updatePathParts(): void {
    this.pathParts = this.currentPath ? this.currentPath.split('/').filter(p => p) : [];
  }

  private loadObjects(loadMore: boolean = false): void {
    if (loadMore) {
      this.loadingMore = true;
    } else {
      this.loading = true;
      this.objects = [];
      this.folders = [];
    }

    const options = {
      prefix: this.currentPath,
      delimiter: '/',
      cursor: loadMore ? this.cursor : undefined,
      limit: 100
    };

    this.storageService.listObjects(this.bucketName, options)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ListObjectsResponse) => {
          if (loadMore) {
            this.objects.push(...response.objects);
          } else {
            this.objects = response.objects;
            this.folders = response.common_prefixes || [];
          }
          
          this.cursor = response.cursor;
          this.hasMore = response.has_more;
          this.filterObjects();
          
          this.loading = false;
          this.loadingMore = false;
        },
        error: (error: any) => {
          console.error('Error loading objects:', error);
          this.loading = false;
          this.loadingMore = false;
        }
      });
  }

  filterObjects(): void {
    if (!this.searchTerm) {
      this.filteredObjects = [...this.objects];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredObjects = this.objects.filter(obj => 
        obj.key.toLowerCase().includes(term)
      );
    }
  }

  navigateToFolder(folder: string): void {
    const folderPath = folder.endsWith('/') ? folder.slice(0, -1) : folder;
    this.router.navigate(['/buckets', this.bucketName, 'browse', folderPath]);
  }

  navigateToPath(path: string): void {
    if (path) {
      this.router.navigate(['/buckets', this.bucketName, 'browse', path]);
    } else {
      this.router.navigate(['/buckets', this.bucketName]);
    }
  }

  getPathUpTo(part: string): string {
    const index = this.pathParts.indexOf(part);
    return this.pathParts.slice(0, index + 1).join('/');
  }

  getFolderName(folder: string): string {
    const folderPath = folder.endsWith('/') ? folder.slice(0, -1) : folder;
    const parts = folderPath.split('/');
    return parts[parts.length - 1] || folderPath;
  }

  getObjectName(key: string): string {
    const relativeKey = this.currentPath ? key.substring(this.currentPath.length + 1) : key;
    return relativeKey;
  }

  loadMore(): void {
    if (this.hasMore && !this.loadingMore) {
      this.loadObjects(true);
    }
  }

  refresh(): void {
    this.cursor = undefined;
    this.loadObjects();
  }

  createFolder(): void {
    // TODO: Implement create folder modal
    console.log('Create folder in:', this.currentPath);
  }

  uploadFile(): void {
    // TODO: Implement file upload
    console.log('Upload file to:', this.currentPath);
  }

  selectObject(object: StorageObject): void {
    // TODO: Implement object selection
    console.log('Selected object:', object);
  }

  downloadObject(object: StorageObject): void {
    // TODO: Implement download
    console.log('Download object:', object);
  }

  deleteObject(object: StorageObject): void {
    // TODO: Implement delete with confirmation
    console.log('Delete object:', object);
  }

  showObjectDetails(object: StorageObject): void {
    // TODO: Implement object details modal
    console.log('Show details for:', object);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString();
  }
}
