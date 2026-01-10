import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StorageService, Bucket, RateLimitInfo } from '../../services/storage.service';
import { DatePipe } from '@angular/common';
import { RateLimitStatusComponent } from '../../components/rate-limit-status/rate-limit-status.component';

@Component({
  selector: 'app-buckets',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, RateLimitStatusComponent],
  template: `
    <div class="space-y-6">
      <!-- Rate Limit Status -->
      <app-rate-limit-status [rateLimitInfo]="rateLimitInfo()"></app-rate-limit-status>

      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Folders</h1>
          <p class="text-gray-600">Manage your storage folders and lifecycle policies</p>
        </div>
        <button (click)="showCreateModal.set(true)" class="btn-primary flex items-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Create Folder
        </button>
      </div>

      @if (loading()) {
        <div class="card p-8 text-center">
          <div class="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
          <p class="text-gray-600 mt-4">Loading folders...</p>
        </div>
      } @else if (buckets().length === 0) {
        <div class="card p-12 text-center">
          <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No folders yet</h3>
          <p class="text-gray-600 mb-4">Create your first folder to start storing files</p>
          <button (click)="showCreateModal.set(true)" class="btn-primary">Create Folder</button>
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Region</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Versioning</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lifecycle Policy</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (bucket of buckets(); track bucket.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <a [routerLink]="['/buckets', bucket.name]" class="text-primary-600 hover:text-primary-700 font-medium">
                      {{ bucket.name }}
                    </a>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-600">{{ bucket.region }}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span [class]="bucket.versioning === 'enabled' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
                          class="px-2 py-1 rounded-full text-xs font-medium">
                      {{ bucket.versioning }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    @if (bucket.lifecycleEnabled) {
                      <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                        Active ({{ bucket.lifecycleRules || 0 }} rules)
                      </span>
                    } @else {
                      <span class="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">
                        Not configured
                      </span>
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                    {{ bucket.created_at | date:'medium' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right">
                    <div class="flex justify-end space-x-2">
                      <a [routerLink]="['/buckets', bucket.name, 'lifecycle']" 
                         class="text-blue-600 hover:text-blue-700 text-sm font-medium">
                        Lifecycle
                      </a>
                      <a [routerLink]="['/buckets', bucket.name]" 
                         class="text-green-600 hover:text-green-700 text-sm font-medium">
                        Browse
                      </a>
                      <button (click)="deleteBucket(bucket)" class="text-red-600 hover:text-red-700 text-sm font-medium">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (showCreateModal()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="card p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold text-gray-900 mb-4">Create Folder</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Folder Name</label>
                <input 
                  type="text"
                  [(ngModel)]="newBucketName"
                  class="input"
                  placeholder="my-folder"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <select [(ngModel)]="newBucketRegion" class="input">
                  <option value="us-west-2">US West 2</option>
                  <option value="us-east-1">US East 1</option>
                  <option value="eu-west-1">EU West 1</option>
                  <option value="ap-southeast-1">Asia Pacific</option>
                </select>
              </div>
              @if (createError()) {
                <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {{ createError() }}
                </div>
              }
              <div class="flex gap-3 justify-end">
                <button (click)="closeModal()" class="btn-secondary">Cancel</button>
                <button (click)="createBucket()" [disabled]="creating()" class="btn-primary disabled:opacity-50">
                  {{ creating() ? 'Creating...' : 'Create' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class BucketsComponent implements OnInit {
  private storageService = inject(StorageService);

  buckets = signal<Bucket[]>([]);
  loading = signal(true);
  showCreateModal = signal(false);
  creating = signal(false);
  createError = signal('');
  rateLimitInfo = signal<RateLimitInfo | null>(null);

  newBucketName = '';
  newBucketRegion = 'us-west-2';

  ngOnInit(): void {
    this.loadBuckets();
    this.loadRateLimitInfo();
  }

  loadBuckets(): void {
    this.loading.set(true);
    this.storageService.listBuckets().subscribe({
      next: (buckets) => {
        // Add mock lifecycle data for now (would come from API)
        const bucketsWithLifecycle = buckets.map(bucket => ({
          ...bucket,
          lifecycleEnabled: Math.random() > 0.7, // Mock: 30% have lifecycle
          lifecycleRules: Math.floor(Math.random() * 5) // Mock: 0-4 rules
        }));
        this.buckets.set(bucketsWithLifecycle);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  loadRateLimitInfo(): void {
    // Mock rate limit info for now
    this.rateLimitInfo.set({
      limit: 1000,
      remaining: 847,
      reset: 245
    });
  }

  createBucket(): void {
    if (!this.newBucketName.trim()) {
      this.createError.set('Please enter a bucket name');
      return;
    }

    this.creating.set(true);
    this.createError.set('');

    this.storageService.createBucket(this.newBucketName.trim(), this.newBucketRegion).subscribe({
      next: () => {
        this.closeModal();
        this.loadBuckets();
      },
      error: (err) => {
        this.createError.set(err.error?.error || 'Failed to create bucket');
        this.creating.set(false);
      }
    });
  }

  deleteBucket(bucket: Bucket): void {
    if (confirm(`Are you sure you want to delete bucket "${bucket.name}"?`)) {
      this.storageService.deleteBucket(bucket.name).subscribe({
        next: () => this.loadBuckets(),
        error: (err) => alert(err.error?.error || 'Failed to delete bucket')
      });
    }
  }

  closeModal(): void {
    this.showCreateModal.set(false);
    this.creating.set(false);
    this.createError.set('');
    this.newBucketName = '';
  }
}
