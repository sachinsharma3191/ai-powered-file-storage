import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Setting {
  key: string;
  value: string;
  secret: boolean;
  updated_at: string;
}

export interface OllamaConfig {
  url: string;
  model: string;
  has_api_key: boolean;
}

export interface OllamaModels {
  models: string[];
  connected: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  constructor(private http: HttpClient) {}

  getSettings(): Observable<Setting[]> {
    return this.http.get<Setting[]>('/api/v1/settings');
  }

  updateSetting(key: string, value: string, secret?: boolean): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`/api/v1/settings/${key}`, { value, secret });
  }

  deleteSetting(key: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/v1/settings/${key}`);
  }

  getOllamaConfig(): Observable<OllamaConfig> {
    return this.http.get<OllamaConfig>('/api/v1/settings/ollama/config');
  }

  updateOllamaConfig(config: { url?: string; model?: string; api_key?: string }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>('/api/v1/settings/ollama/config', config);
  }

  getAvailableModels(): Observable<OllamaModels> {
    return this.http.get<OllamaModels>('/api/v1/settings/ollama/models');
  }

  pullModel(model: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/v1/settings/ollama/pull', { model });
  }
}
