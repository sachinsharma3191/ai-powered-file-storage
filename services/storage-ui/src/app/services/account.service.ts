import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Account {
  id: number;
  plan: string;
  created_at: string;
  api_key: {
    id: number;
    name: string;
    status: string;
    created_at: string;
  };
}

export interface ApiKey {
  id: number;
  name: string;
  status: string;
  scopes: Record<string, unknown>;
  created_at: string;
}

export interface CreateApiKeyResponse {
  api_key: ApiKey;
  plaintext_key: string;
}

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  constructor(private http: HttpClient) {}

  getAccount(): Observable<Account> {
    return this.http.get<Account>('/api/v1/account');
  }

  getApiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>('/api/v1/account/api_keys');
  }

  createApiKey(name: string, scopes?: Record<string, unknown>): Observable<CreateApiKeyResponse> {
    return this.http.post<CreateApiKeyResponse>('/api/v1/account/api_keys', { name, scopes: scopes || {} });
  }

  revokeApiKey(keyId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/v1/account/api_keys/${keyId}`);
  }

  updatePlan(plan: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>('/api/v1/account/plan', { plan });
  }

  activateApiKey(keyId: number): Observable<{ api_key: ApiKey }> {
    return this.http.put<{ api_key: ApiKey }>(`/api/v1/account/api_keys/${keyId}/activate`, {});
  }
}
