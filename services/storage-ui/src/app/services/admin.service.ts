import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface OllamaModel {
  name: string;
  size: number;
  modified: string;
}

export interface ModelsResponse {
  models: OllamaModel[];
  connected: boolean;
  error?: string;
}

export interface AdminSettings {
  ollama_url: string;
  admin_password: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private adminToken: string | null = null;
  private readonly ADMIN_TOKEN_KEY = 'admin_token';

  constructor(private http: HttpClient) {
    this.adminToken = localStorage.getItem(this.ADMIN_TOKEN_KEY);
  }

  setAdminToken(token: string): void {
    this.adminToken = token;
    localStorage.setItem(this.ADMIN_TOKEN_KEY, token);
  }

  clearAdminToken(): void {
    this.adminToken = null;
    localStorage.removeItem('admin_token');
  }

  isAdminAuthenticated(): boolean {
    return !!this.adminToken;
  }

  getAdminToken(): string | null {
    return this.adminToken;
  }

  getSettings(): Observable<AdminSettings> {
    return this.http.get<AdminSettings>('/api/v1/admin/settings', {
      headers: { 'X-Admin-Token': this.adminToken || '' }
    });
  }

  getAvailableModels(): Observable<ModelsResponse> {
    return this.http.get<ModelsResponse>('/api/v1/admin/ollama/models', {
      headers: { 'X-Admin-Token': this.adminToken || '' }
    });
  }

  login(password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/v1/admin/login', { password }).pipe(
      tap(response => {
        // Store the admin token for future requests
        this.setAdminToken('authenticated'); // Simple token for now
      })
    );
  }

  pullModel(model: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/v1/admin/ollama/pull', { model }, {
      headers: { 'X-Admin-Token': this.adminToken || '' }
    });
  }

  deleteModel(model: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/v1/admin/ollama/models/${encodeURIComponent(model)}`, {
      headers: { 'X-Admin-Token': this.adminToken || '' }
    });
  }
}
