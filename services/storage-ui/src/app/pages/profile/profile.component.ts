import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountService, Account, ApiKey } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p class="text-gray-600">Manage your account and API keys</p>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
        @if (account()) {
          <div class="space-y-3">
            <div class="flex justify-between py-2 border-b">
              <span class="text-gray-600">Account ID</span>
              <span class="font-medium">{{ account()!.id }}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-gray-600">Plan</span>
              <span [class]="getPlanClass(account()!.plan)" class="px-2 py-1 rounded-full text-sm font-medium">
                {{ account()!.plan }}
              </span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-gray-600">Created</span>
              <span class="font-medium">{{ account()!.created_at | date:'medium' }}</span>
            </div>
          </div>
        } @else {
          <div class="animate-pulse space-y-3">
            <div class="h-8 bg-gray-200 rounded"></div>
            <div class="h-8 bg-gray-200 rounded"></div>
          </div>
        }
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Plan Limits & Usage</h2>
        @if (account()) {
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="text-2xl font-bold text-gray-900">{{ apiKeys().length }}</div>
                <div class="text-sm text-gray-600">API Keys</div>
                <div class="text-xs text-gray-500 mt-1">Limit: {{ getPlanLimits(account()!.plan).apiKeys === -1 ? 'Unlimited' : getPlanLimits(account()!.plan).apiKeys }}</div>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="text-2xl font-bold text-gray-900">{{ storageUsed() }}GB</div>
                <div class="text-sm text-gray-600">Storage Used</div>
                <div class="text-xs text-gray-500 mt-1">Limit: {{ getPlanLimits(account()!.plan).storage === -1 ? 'Unlimited' : getPlanLimits(account()!.plan).storage + 'GB' }}</div>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="text-2xl font-bold text-gray-900">{{ folderCount() }}</div>
                <div class="text-sm text-gray-600">Folders</div>
                <div class="text-xs text-gray-500 mt-1">Limit: {{ getPlanLimits(account()!.plan).folders === -1 ? 'Unlimited' : getPlanLimits(account()!.plan).folders }}</div>
              </div>
            </div>
            
            @if (account()!.plan !== 'enterprise') {
              <div class="border-t pt-4">
                <h3 class="text-sm font-medium text-gray-900 mb-3">Upgrade Your Plan</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  @if (account()!.plan === 'free') {
                    <button (click)="upgradePlan('pro')" class="p-3 border border-blue-200 rounded-lg hover:bg-blue-50 text-left">
                      <div class="font-medium text-blue-900">Pro Plan</div>
                      <div class="text-sm text-blue-700">1000 API Keys, 50000 Folders, 100GB Storage</div>
                    </button>
                  }
                  <button (click)="upgradePlan('enterprise')" class="p-3 border border-purple-200 rounded-lg hover:bg-purple-50 text-left">
                    <div class="font-medium text-purple-900">Enterprise Plan</div>
                    <div class="text-sm text-purple-700">Unlimited API Keys, Folders & Storage</div>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Current API Key</h2>
        <div class="p-4 bg-gray-50 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600">Your current API key (stored locally)</span>
            <button (click)="toggleShowKey()" class="text-primary-600 hover:text-primary-700 text-sm">
              {{ showCurrentKey() ? 'Hide' : 'Show' }}
            </button>
          </div>
          <code class="block p-3 bg-white rounded border text-sm break-all font-mono">
            {{ showCurrentKey() ? currentApiKey() : '••••••••••••••••••••••••••••••••' }}
          </code>
          <button (click)="copyToClipboard(currentApiKey())" class="mt-2 text-sm text-primary-600 hover:text-primary-700">
            Copy to clipboard
          </button>
        </div>
      </div>

      <div class="card p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold text-gray-900">API Keys</h2>
          <button (click)="showCreateModal.set(true)" class="btn-primary text-sm">
            Create New Key
          </button>
        </div>

        @if (loading()) {
          <div class="animate-pulse space-y-3">
            <div class="h-12 bg-gray-200 rounded"></div>
            <div class="h-12 bg-gray-200 rounded"></div>
          </div>
        } @else if (apiKeys().length === 0) {
          <p class="text-gray-500 text-center py-4">No API keys found</p>
        } @else {
          <div class="space-y-3">
            @for (key of apiKeys(); track key.id) {
              <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div class="font-medium">{{ key.name }}</div>
                  <div class="text-sm text-gray-500">
                    Created {{ key.created_at | date:'medium' }}
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span [class]="key.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
                        class="px-2 py-1 rounded-full text-xs font-medium">
                    {{ key.status }}
                  </span>
                  @if (key.status === 'inactive' && key.id !== account()?.api_key?.id) {
                    <button (click)="activateKey(key)" class="text-green-600 hover:text-green-700 text-sm font-medium">
                      Activate
                    </button>
                  }
                  @if (key.status === 'active' && key.id !== account()?.api_key?.id) {
                    <button (click)="revokeKey(key)" class="text-red-600 hover:text-red-700 text-sm">
                      Revoke
                    </button>
                  }
                  @if (key.id === account()?.api_key?.id) {
                    <span class="text-xs text-gray-500">(current)</span>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      
      @if (showCreateModal()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="card p-6 max-w-md w-full mx-4">
            <h2 class="text-xl font-bold text-gray-900 mb-4">Create API Key</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
                <input
                  type="text"
                  [(ngModel)]="newKeyName"
                  class="input"
                  placeholder="my-api-key"
                />
              </div>

              @if (newKeyCreated()) {
                <div class="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p class="text-green-800 font-medium mb-2">API Key Created!</p>
                  <p class="text-sm text-green-700 mb-2">Save this key now - it won't be shown again:</p>
                  <code class="block p-2 bg-white rounded border text-xs break-all">{{ newKeyCreated() }}</code>
                  <button (click)="copyToClipboard(newKeyCreated()!)" class="mt-2 text-sm text-green-700 hover:text-green-800">
                    Copy to clipboard
                  </button>
                </div>
              }

              @if (createError()) {
                <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {{ createError() }}
                </div>
              }

              <div class="flex gap-3 justify-end">
                <button (click)="closeCreateModal()" class="btn-secondary">
                  {{ newKeyCreated() ? 'Close' : 'Cancel' }}
                </button>
                @if (!newKeyCreated()) {
                  <button (click)="createKey()" [disabled]="creating()" class="btn-primary">
                    {{ creating() ? 'Creating...' : 'Create Key' }}
                  </button>
                }
              </div>
            </div>
          </div>
        </div>
      }

          </div>
  `
})
export class ProfileComponent implements OnInit {
  private accountService = inject(AccountService);
  private authService = inject(AuthService);

  account = signal<Account | null>(null);
  apiKeys = signal<ApiKey[]>([]);
  loading = signal(true);
  showCurrentKey = signal(false);
  showCreateModal = signal(false);
  creating = signal(false);
  createError = signal('');
  newKeyCreated = signal<string | null>(null);
  newKeyName = '';
  
  ngOnInit(): void {
    this.loadAccount();
    this.loadApiKeys();
  }

  currentApiKey(): string {
    return this.authService.getApiKey() || '';
  }

  toggleShowKey(): void {
    this.showCurrentKey.update(v => !v);
  }

  loadAccount(): void {
    this.accountService.getAccount().subscribe({
      next: (account) => this.account.set(account),
      error: () => {}
    });
  }

  loadApiKeys(): void {
    this.loading.set(true);
    this.accountService.getApiKeys().subscribe({
      next: (keys) => {
        this.apiKeys.set(keys);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  createKey(): void {
    if (!this.newKeyName.trim()) {
      this.createError.set('Please enter a key name');
      return;
    }

    this.creating.set(true);
    this.createError.set('');

    this.accountService.createApiKey(this.newKeyName.trim()).subscribe({
      next: (response) => {
        this.newKeyCreated.set(response.plaintext_key);
        this.creating.set(false);
        this.loadApiKeys();
      },
      error: (err) => {
        this.createError.set(err.error?.error || 'Failed to create API key');
        this.creating.set(false);
      }
    });
  }

  revokeKey(key: ApiKey): void {
    if (confirm(`Are you sure you want to revoke "${key.name}"?`)) {
      this.accountService.revokeApiKey(key.id).subscribe({
        next: () => this.loadApiKeys(),
        error: (err) => alert(err.error?.error || 'Failed to revoke API key')
      });
    }
  }

  activateKey(key: ApiKey): void {
    if (confirm(`Activate "${key.name}"? This will deactivate your current API key.`)) {
      this.accountService.activateApiKey(key.id).subscribe({
        next: () => {
          this.loadApiKeys();
          this.loadAccount(); // Reload account to get current API key info
        },
        error: (err) => alert(err.error?.error || 'Failed to activate API key')
      });
    }
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.creating.set(false);
    this.createError.set('');
    this.newKeyCreated.set(null);
    this.newKeyName = '';
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    });
  }

  getPlanClass(plan: string): string {
    switch (plan) {
      case 'free':
        return 'bg-gray-100 text-gray-800';
      case 'pro':
        return 'bg-blue-100 text-blue-800';
      case 'enterprise':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getPlanLimits(plan: string): { apiKeys: number; folders: number; storage: number } {
    switch (plan) {
      case 'free':
        return { apiKeys: 5, folders: 20, storage: 5 }; // 5GB storage
      case 'pro':
        return { apiKeys: 1000, folders: 50000, storage: 100 }; // 100GB storage
      case 'enterprise':
        return { apiKeys: -1, folders: -1, storage: -1 }; // -1 means unlimited
      default:
        return { apiKeys: 5, folders: 20, storage: 5 };
    }
  }

  storageUsed(): number {
    // This would typically come from a service, but for now we'll return a placeholder
    return 2; // 2GB used
  }

  folderCount(): number {
    // This would typically come from a service, but for now we'll return a placeholder
    return 0;
  }

  upgradePlan(newPlan: string): void {
    if (confirm(`Upgrade to ${newPlan} plan? This may change your billing.`)) {
      this.accountService.updatePlan(newPlan).subscribe({
        next: () => {
          this.loadAccount();
          alert(`Successfully upgraded to ${newPlan} plan!`);
        },
        error: (err) => alert(err.error?.error || 'Failed to upgrade plan')
      });
    }
  }
}
