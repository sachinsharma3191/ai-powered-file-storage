import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService, OllamaModel } from '../../services/admin.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    @if (!authenticated()) {
      <div class="min-h-[80vh] flex items-center justify-center">
        <div class="card p-8 max-w-md w-full">
          <div class="text-center mb-6">
            <svg class="w-16 h-16 text-red-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h1 class="text-2xl font-bold text-gray-900">Admin Access</h1>
            <p class="text-gray-600 mt-2">Enter admin password to continue</p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
              <input 
                type="password"
                [(ngModel)]="adminPassword"
                class="input"
                placeholder="Enter admin password"
                (keyup.enter)="authenticate()"
              />
            </div>
            <button (click)="authenticate()" [disabled]="verifying()" class="btn-primary w-full">
              {{ verifying() ? 'Verifying...' : 'Access Admin Panel' }}
            </button>
            @if (authError()) {
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {{ authError() }}
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <button (click)="openSettings()" class="text-left hover:bg-gray-50 p-2 rounded-lg transition-colors">
              <h1 class="text-2xl font-bold text-gray-900">Admin Settings</h1>
              <p class="text-gray-600">Global system configuration</p>
            </button>
          </div>
          <button (click)="logout()" class="btn-secondary">
            Exit Admin
          </button>
        </div>

        <div class="card p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            Ollama LLM Server
          </h2>

          <div class="flex items-center gap-2 mb-4">
            @if (connected()) {
              <span class="flex items-center gap-2 text-green-600">
                <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Connected to Ollama
              </span>
            } @else {
              <span class="flex items-center gap-2 text-red-600">
                <span class="w-2 h-2 bg-red-500 rounded-full"></span>
                Not connected
              </span>
            }
            <button (click)="loadModels()" class="text-primary-600 hover:text-primary-700 text-sm ml-2">
              Refresh
            </button>
          </div>

          @if (connectionError()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
              {{ connectionError() }}
            </div>
          }
        </div>

        
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Account Plans</h2>
          <p class="text-sm text-gray-600 mb-4">Manage user account plans</p>
          
          <div class="space-y-3">
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div class="font-medium">Free Plan</div>
                <div class="text-sm text-gray-500">Basic storage features</div>
              </div>
              <span class="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                Default
              </span>
            </div>
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div class="font-medium">Pro Plan</div>
                <div class="text-sm text-gray-500">Extended features and storage</div>
              </div>
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                Premium
              </span>
            </div>
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div class="font-medium">Enterprise Plan</div>
                <div class="text-sm text-gray-500">Full access and unlimited storage</div>
              </div>
              <span class="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                Business
              </span>
            </div>
          </div>
          
          <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 class="font-medium text-blue-800 mb-2">Plan Management</h4>
            <p class="text-sm text-blue-700">
              Users can upgrade their plans through their profile page. Admins can also manually update user plans via the API.
            </p>
          </div>
        </div>

        <div class="card p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Pull New Model</h2>
          <p class="text-sm text-gray-600 mb-4">Download models from Ollama registry</p>
          
          <div class="flex gap-2">
            <input
              type="text"
              [(ngModel)]="newModelName"
              class="input flex-1"
              placeholder="e.g., llama3.2, mistral, codellama, phi3"
            />
            <button (click)="pullModel()" [disabled]="pulling()" class="btn-primary">
              {{ pulling() ? 'Pulling...' : 'Pull Model' }}
            </button>
          </div>

          @if (pullStatus()) {
            <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              {{ pullStatus() }}
            </div>
          }

          @if (pullError()) {
            <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {{ pullError() }}
            </div>
          }

          <div class="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 class="font-medium text-gray-700 mb-2">Popular Models</h4>
            <div class="flex flex-wrap gap-2">
              @for (model of popularModels; track model) {
                <button 
                  (click)="newModelName = model"
                  class="px-3 py-1 bg-white border rounded-full text-sm hover:border-primary-500 hover:text-primary-600"
                >
                  {{ model }}
                </button>
              }
            </div>
          </div>
        </div>

        <div class="card p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Installed Models</h2>
          
          @if (loadingModels()) {
            <div class="flex items-center justify-center py-8">
              <div class="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
            </div>
          } @else if (models().length === 0) {
            <p class="text-gray-500 text-center py-8">No models installed. Pull a model to get started.</p>
          } @else {
            <div class="space-y-3">
              @for (model of models(); track model.name) {
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div class="font-medium">{{ model.name }}</div>
                    <div class="text-sm text-gray-500">
                      {{ formatSize(model.size) }} · Modified {{ model.modified | date:'short' }}
                    </div>
                  </div>
                  <button 
                    (click)="deleteModel(model)"
                    class="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `
})
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);

  adminPassword = '';
  newModelName = '';

  authenticated = signal(false);
  verifying = signal(false);
  authError = signal('');

  models = signal<OllamaModel[]>([]);
  loadingModels = signal(false);
  connected = signal(false);
  connectionError = signal('');

  pulling = signal(false);
  pullStatus = signal('');
  pullError = signal('');

  popularModels = ['llama3.2', 'llama3.2:1b', 'mistral', 'codellama', 'phi3', 'gemma2', 'qwen2'];

  ngOnInit(): void {
    if (this.adminService.isAdminAuthenticated()) {
      this.authenticated.set(true);
      this.loadModels();
    }
  }

  authenticate(): void {
    if (!this.adminPassword.trim()) {
      this.authError.set('Please enter the admin password');
      return;
    }

    this.verifying.set(true);
    this.authError.set('');
    this.adminService.setAdminToken(this.adminPassword);

    this.adminService.getSettings().subscribe({
      next: () => {
        this.authenticated.set(true);
        this.verifying.set(false);
        this.loadModels();
      },
      error: () => {
        this.adminService.clearAdminToken();
        this.authError.set('Invalid admin password');
        this.verifying.set(false);
      }
    });
  }

  openSettings(): void {
    // Open settings modal or navigate to settings page
    // For now, let's show an alert or navigate to a settings section
    alert('Settings functionality coming soon! This would open a settings modal or navigate to a dedicated settings page.');
  }

  logout(): void {
    this.adminService.clearAdminToken();
    this.authenticated.set(false);
    this.router.navigate(['/buckets']);
  }

  loadModels(): void {
    this.loadingModels.set(true);
    this.connectionError.set('');

    this.adminService.getAvailableModels().subscribe({
      next: (response) => {
        this.models.set(response.models);
        this.connected.set(response.connected);
        if (response.error) {
          this.connectionError.set(response.error);
        }
        this.loadingModels.set(false);
      },
      error: (err) => {
        this.connected.set(false);
        this.connectionError.set(err.error?.error || 'Failed to connect');
        this.loadingModels.set(false);
      }
    });
  }

  pullModel(): void {
    if (!this.newModelName.trim()) {
      this.pullError.set('Please enter a model name');
      return;
    }

    this.pulling.set(true);
    this.pullStatus.set(`Pulling ${this.newModelName}... This may take several minutes.`);
    this.pullError.set('');

    this.adminService.pullModel(this.newModelName).subscribe({
      next: () => {
        this.pullStatus.set(`Successfully pulled ${this.newModelName}`);
        this.pulling.set(false);
        this.newModelName = '';
        this.loadModels();
        setTimeout(() => this.pullStatus.set(''), 5000);
      },
      error: (err) => {
        this.pullError.set(err.error?.error || 'Failed to pull model');
        this.pullStatus.set('');
        this.pulling.set(false);
      }
    });
  }

  deleteModel(model: OllamaModel): void {
    if (confirm(`Are you sure you want to delete "${model.name}"?`)) {
      this.adminService.deleteModel(model.name).subscribe({
        next: () => this.loadModels(),
        error: (err) => alert(err.error?.error || 'Failed to delete model')
      });
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return 'Unknown size';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }
}
