import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService, CreateApiKeyResponse } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-api-key',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-[80vh] flex items-center justify-center">
      <div class="card p-8 max-w-md w-full">
        <div class="text-center mb-8">
          <svg class="w-16 h-16 text-primary-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 12h.01"/>
          </svg>
          <h1 class="text-2xl font-bold text-gray-900">Create API Key</h1>
          <p class="text-gray-600 mt-2">Generate an API key to access storage services</p>
        </div>

        @if (!apiKeyCreated()) {
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">API Key Name</label>
              <input 
                type="text"
                [(ngModel)]="keyName"
                class="input"
                placeholder="my-api-key"
              />
              <p class="text-xs text-gray-500 mt-1">A friendly name to identify this API key</p>
            </div>

            <button 
              (click)="createApiKey()" 
              [disabled]="loading()"
              class="btn-primary w-full disabled:opacity-50"
            >
              @if (loading()) {
                <span>Creating...</span>
              } @else {
                <span>Create API Key</span>
              }
            </button>
          </div>
        } @else {
          <div class="space-y-4">
            <div class="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p class="text-green-800 font-medium mb-2">API Key Created!</p>
              <p class="text-sm text-green-700 mb-2">Save this key now - it won't be shown again:</p>
              <code class="block p-2 bg-white rounded border text-xs break-all font-mono">{{ apiKeyCreated() }}</code>
              <button (click)="copyApiKey()" class="mt-2 text-sm text-green-700 hover:text-green-800">
                Copy to clipboard
              </button>
            </div>

            <button (click)="continueToApp()" class="btn-primary w-full">
              Continue to Storage
            </button>
          </div>
        }

        @if (error()) {
          <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {{ error() }}
          </div>
        }
      </div>
    </div>
  `
})
export class ApiKeyComponent implements OnInit {
  private accountService = inject(AccountService);
  private authService = inject(AuthService);
  private router = inject(Router);

  keyName = 'default-key';
  
  loading = signal(false);
  error = signal('');
  apiKeyCreated = signal<string | null>(null);

  ngOnInit(): void {
    // No need to check existing API key - the guard handles this
  }

  createApiKey(): void {
    if (!this.keyName.trim()) {
      this.error.set('Please enter an API key name');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.accountService.createApiKey(this.keyName.trim()).subscribe({
      next: (response: CreateApiKeyResponse) => {
        this.apiKeyCreated.set(response.plaintext_key);
        this.authService.setApiKey(response.plaintext_key);
        this.loading.set(false);
        
        // Redirect to buckets after successful API key creation
        setTimeout(() => {
          this.router.navigate(['/buckets']);
        }, 2000);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to create API key');
        this.loading.set(false);
      }
    });
  }

  copyApiKey(): void {
    const key = this.apiKeyCreated();
    if (key) {
      navigator.clipboard.writeText(key).then(() => {
        alert('API key copied to clipboard!');
      });
    }
  }

  continueToApp(): void {
    this.router.navigate(['/buckets']);
  }
}
