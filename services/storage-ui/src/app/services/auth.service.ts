import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface Account {
  id: number;
  plan: string;
  created_at: string;
  api_key?: {
    id: number;
    name: string;
    status: string;
    created_at: string;
  };
}

export interface AuthResponse {
  user: User;
  session_token: string;
  account: Account;
}

interface BootstrapResponse {
  account: { id: number; plan: string };
  api_key: { id: number; name: string; status: string };
  plaintext_key: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_STORAGE = 'session_token';
  private readonly USER_STORAGE = 'current_user';
  private readonly API_KEY_STORAGE = 'storage_api_key';
  
  private tokenSignal = signal<string | null>(this.getStoredToken());
  private userSignal = signal<User | null>(this.getStoredUser());
  private apiKeySignal = signal<string | null>(this.getStoredApiKey());

  constructor(private http: HttpClient) {}

  getToken(): string | null {
    return this.tokenSignal();
  }

  getUser(): User | null {
    return this.userSignal();
  }

  getApiKey(): string | null {
    return this.apiKeySignal();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  signup(username: string, password: string, plan: string = 'free'): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/signup', {
      username,
      password,
      plan
    }).pipe(
      tap(response => {
        this.setSession(response.session_token, response.user);
      })
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/login', {
      username,
      password
    }).pipe(
      tap(response => {
        this.setSession(response.session_token, response.user);
      })
    );
  }

  bootstrap(plan: string, apiKeyName: string): Observable<BootstrapResponse> {
    return this.http.post<BootstrapResponse>('/api/v1/bootstrap', {
      plan,
      api_key_name: apiKeyName,
      scopes: {}
    }, {
      headers: {
        'X-Bootstrap-Token': 'dev-bootstrap-token'
      }
    }).pipe(
      tap(response => {
        this.setApiKey(response.plaintext_key);
      })
    );
  }

  setSession(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_STORAGE, token);
    localStorage.setItem(this.USER_STORAGE, JSON.stringify(user));
    this.tokenSignal.set(token);
    this.userSignal.set(user);
  }

  setApiKey(key: string): void {
    localStorage.setItem(this.API_KEY_STORAGE, key);
    this.apiKeySignal.set(key);
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_STORAGE);
    localStorage.removeItem(this.USER_STORAGE);
    localStorage.removeItem(this.API_KEY_STORAGE);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.apiKeySignal.set(null);
  }

  private getStoredToken(): string | null {
    return localStorage.getItem(this.TOKEN_STORAGE);
  }

  private getStoredUser(): User | null {
    const data = localStorage.getItem(this.USER_STORAGE);
    return data ? JSON.parse(data) : null;
  }

  private getStoredApiKey(): string | null {
    return localStorage.getItem(this.API_KEY_STORAGE);
  }
}
