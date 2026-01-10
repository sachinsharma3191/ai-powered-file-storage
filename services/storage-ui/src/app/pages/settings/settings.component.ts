import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService, OllamaConfig } from '../../services/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Settings</h1>
        <p class="text-gray-600">Configure your storage platform</p>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          Ollama LLM Settings
        </h2>

        <div class="space-y-4">
          <div class="flex items-center gap-2 mb-4">
            @if (connected()) {
              <span class="flex items-center gap-2 text-green-600">
                <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                Connected
              </span>
            } @else {
              <span class="flex items-center gap-2 text-red-600">
                <span class="w-2 h-2 bg-red-500 rounded-full"></span>
                Not connected
              </span>
            }
            <button (click)="checkConnection()" class="text-primary-600 hover:text-primary-700 text-sm">
              Refresh
            </button>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Ollama URL</label>
            <input
              type="text"
              [(ngModel)]="ollamaUrl"
              class="input"
              placeholder="{{ ollamaUrl }}"
            />
            <p class="text-xs text-gray-500 mt-1">URL of the Ollama server</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <div class="flex gap-2">
              <select [(ngModel)]="ollamaModel" class="input flex-1">
                @for (model of availableModels(); track model) {
                  <option [value]="model">{{ model }}</option>
                }
                @if (!availableModels().includes(ollamaModel)) {
                  <option [value]="ollamaModel">{{ ollamaModel }} (not installed)</option>
                }
              </select>
              <button (click)="refreshModels()" class="btn-secondary" [disabled]="loadingModels()">
                @if (loadingModels()) {
                  <span class="animate-spin">⟳</span>
                } @else {
                  Refresh
                }
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API Key (Optional)</label>
            <input
              type="password"
              [(ngModel)]="ollamaApiKey"
              class="input"
              placeholder="Enter API key if required"
            />
            @if (hasApiKey()) {
              <p class="text-xs text-green-600 mt-1">API key is set</p>
            }
          </div>

          @if (error()) {
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {{ error() }}
            </div>
          }

          @if (success()) {
            <div class="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {{ success() }}
            </div>
          }

          <div class="flex gap-3">
            <button (click)="saveSettings()" [disabled]="saving()" class="btn-primary">
              {{ saving() ? 'Saving...' : 'Save Settings' }}
            </button>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Pull New Model</h2>
        <div class="flex gap-2">
          <input
            type="text"
            [(ngModel)]="newModelName"
            class="input flex-1"
            placeholder="e.g., llama3.2, mistral, codellama"
          />
          <button (click)="pullModel()" [disabled]="pulling()" class="btn-primary">
            {{ pulling() ? 'Pulling...' : 'Pull Model' }}
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Download a new model from Ollama registry. This may take several minutes.
        </p>

        @if (pullStatus()) {
          <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            {{ pullStatus() }}
          </div>
        }
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Available Models</h2>
        @if (availableModels().length === 0) {
          <p class="text-gray-500">No models installed. Pull a model to get started.</p>
        } @else {
          <div class="space-y-2">
            @for (model of availableModels(); track model) {
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span class="font-medium">{{ model }}</span>
                <button
                  (click)="selectModel(model)"
                  [class]="model === ollamaModel ? 'btn-primary' : 'btn-secondary'"
                >
                  {{ model === ollamaModel ? 'Selected' : 'Use' }}
                </button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  private settingsService = inject(SettingsService);

  ollamaUrl = process.env['NG_APP_OLLAMA_URL'] || 'http://ollama:11434';
  ollamaModel = 'llama3.2';
  ollamaApiKey = '';
  newModelName = '';

  connected = signal(false);
  hasApiKey = signal(false);
  availableModels = signal<string[]>([]);
  loadingModels = signal(false);
  saving = signal(false);
  pulling = signal(false);
  error = signal('');
  success = signal('');
  pullStatus = signal('');

  ngOnInit(): void {
    this.loadConfig();
    this.refreshModels();
  }

  loadConfig(): void {
    this.settingsService.getOllamaConfig().subscribe({
      next: (config) => {
        this.ollamaUrl = config.url;
        this.ollamaModel = config.model;
        this.hasApiKey.set(config.has_api_key);
      },
      error: () => {}
    });
  }

  checkConnection(): void {
    this.refreshModels();
  }

  refreshModels(): void {
    this.loadingModels.set(true);
    this.settingsService.getAvailableModels().subscribe({
      next: (result) => {
        this.availableModels.set(result.models);
        this.connected.set(result.connected);
        if (result.error) {
          this.error.set(result.error);
        }
        this.loadingModels.set(false);
      },
      error: (err) => {
        this.connected.set(false);
        this.error.set(err.error?.error || 'Failed to connect to Ollama');
        this.loadingModels.set(false);
      }
    });
  }

  saveSettings(): void {
    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    const config: { url?: string; model?: string; api_key?: string } = {
      url: this.ollamaUrl,
      model: this.ollamaModel
    };

    if (this.ollamaApiKey) {
      config.api_key = this.ollamaApiKey;
    }

    this.settingsService.updateOllamaConfig(config).subscribe({
      next: () => {
        this.success.set('Settings saved successfully');
        this.saving.set(false);
        this.ollamaApiKey = '';
        this.loadConfig();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to save settings');
        this.saving.set(false);
      }
    });
  }

  selectModel(model: string): void {
    this.ollamaModel = model;
    this.saveSettings();
  }

  pullModel(): void {
    if (!this.newModelName.trim()) {
      this.error.set('Please enter a model name');
      return;
    }

    this.pulling.set(true);
    this.pullStatus.set(`Pulling ${this.newModelName}... This may take several minutes.`);
    this.error.set('');

    this.settingsService.pullModel(this.newModelName).subscribe({
      next: () => {
        this.pullStatus.set(`Successfully pulled ${this.newModelName}`);
        this.pulling.set(false);
        this.newModelName = '';
        this.refreshModels();
        setTimeout(() => this.pullStatus.set(''), 5000);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to pull model');
        this.pullStatus.set('');
        this.pulling.set(false);
      }
    });
  }
}
