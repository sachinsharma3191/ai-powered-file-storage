import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StorageService, StorageObject } from '../../services/storage.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-objects',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm">
        <a routerLink="/buckets" class="text-primary-600 hover:text-primary-700">Buckets</a>
        <span class="text-gray-400">/</span>
        <span class="text-gray-900 font-medium">{{ bucketName }}</span>
      </div>

      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ bucketName }}</h1>
          <p class="text-gray-600">{{ objects().length }} objects</p>
        </div>
        <button (click)="showUploadModal.set(true)" class="btn-primary flex items-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload Object
        </button>
      </div>

      @if (loading()) {
        <div class="card p-8 text-center">
          <div class="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
          <p class="text-gray-600 mt-4">Loading objects...</p>
        </div>
      } @else if (objects().length === 0) {
        <div class="card p-12 text-center">
          <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No objects yet</h3>
          <p class="text-gray-600 mb-4">Upload your first object to this bucket</p>
          <button (click)="showUploadModal.set(true)" class="btn-primary">Upload Object</button>
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modified</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (obj of objects(); track obj.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                      </svg>
                      <span class="font-medium text-gray-900">{{ obj.key }}</span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-600">
                    {{ formatSize(obj.current_version?.size || 0) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span [class]="obj.current_version?.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
                          class="px-2 py-1 rounded-full text-xs font-medium">
                      {{ obj.current_version?.status || 'pending' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                    {{ obj.updated_at | date:'medium' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right">
                    <button (click)="deleteObject(obj)" class="text-red-600 hover:text-red-700 text-sm font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (showUploadModal()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="card p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold text-gray-900 mb-4">Upload Object</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Object Key</label>
                <input 
                  type="text"
                  [(ngModel)]="newObjectKey"
                  class="input"
                  placeholder="folder/file.txt"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input 
                  type="file"
                  (change)="onFileSelected($event)"
                  class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>
              @if (uploadProgress() > 0 && uploadProgress() < 100) {
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-primary-600 h-2 rounded-full transition-all" [style.width.%]="uploadProgress()"></div>
                </div>
              }
              @if (uploadError()) {
                <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {{ uploadError() }}
                </div>
              }
              <div class="flex gap-3 justify-end">
                <button (click)="closeUploadModal()" class="btn-secondary">Cancel</button>
                <button (click)="uploadObject()" [disabled]="uploading()" class="btn-primary disabled:opacity-50">
                  {{ uploading() ? 'Uploading...' : 'Upload' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class ObjectsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private storageService = inject(StorageService);

  bucketName = '';
  objects = signal<StorageObject[]>([]);
  loading = signal(true);
  showUploadModal = signal(false);
  uploading = signal(false);
  uploadProgress = signal(0);
  uploadError = signal('');

  newObjectKey = '';
  selectedFile: File | null = null;

  ngOnInit(): void {
    this.bucketName = this.route.snapshot.paramMap.get('bucketName') || '';
    this.loadObjects();
  }

  loadObjects(): void {
    this.loading.set(true);
    this.storageService.listObjects(this.bucketName).subscribe({
      next: (objects) => {
        this.objects.set(objects);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      if (!this.newObjectKey) {
        this.newObjectKey = this.selectedFile.name;
      }
    }
  }

  uploadObject(): void {
    if (!this.newObjectKey.trim()) {
      this.uploadError.set('Please enter an object key');
      return;
    }
    if (!this.selectedFile) {
      this.uploadError.set('Please select a file');
      return;
    }

    this.uploading.set(true);
    this.uploadError.set('');
    this.uploadProgress.set(10);

    this.storageService.createObject(this.bucketName, this.newObjectKey).subscribe({
      next: (response) => {
        this.uploadProgress.set(30);
        
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const gatewayUrl = `${response.chunk_gateway_base_url}/objects/${this.bucketName}/${encodeURIComponent(this.newObjectKey)}`;
          
          this.storageService.uploadToChunkGateway(gatewayUrl, response.token, arrayBuffer).subscribe({
            next: (uploadResponse) => {
              this.uploadProgress.set(70);
              
              this.storageService.completeUpload(
                this.bucketName,
                this.newObjectKey,
                response.version.version_id,
                uploadResponse.etag,
                this.selectedFile!.size
              ).subscribe({
                next: () => {
                  this.uploadProgress.set(100);
                  this.closeUploadModal();
                  this.loadObjects();
                },
                error: (err) => {
                  this.uploadError.set(err.error?.error || 'Failed to complete upload');
                  this.uploading.set(false);
                }
              });
            },
            error: (err) => {
              this.uploadError.set(err.error?.error || 'Failed to upload to chunk gateway');
              this.uploading.set(false);
            }
          });
        };
        reader.readAsArrayBuffer(this.selectedFile!);
      },
      error: (err) => {
        this.uploadError.set(err.error?.error || 'Failed to create object');
        this.uploading.set(false);
      }
    });
  }

  deleteObject(obj: StorageObject): void {
    if (confirm(`Are you sure you want to delete "${obj.key}"?`)) {
      this.storageService.deleteObject(this.bucketName, obj.key).subscribe({
        next: () => this.loadObjects(),
        error: (err) => alert(err.error?.error || 'Failed to delete object')
      });
    }
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  closeUploadModal(): void {
    this.showUploadModal.set(false);
    this.uploading.set(false);
    this.uploadProgress.set(0);
    this.uploadError.set('');
    this.newObjectKey = '';
    this.selectedFile = null;
  }
}
