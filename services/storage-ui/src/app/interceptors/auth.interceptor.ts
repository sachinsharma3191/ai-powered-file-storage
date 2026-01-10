import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();
  const apiKey = authService.getApiKey();

  if (req.url.includes('/api/')) {
    let headers = req.headers;
    
    // Always use session token for UI requests
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Only use API key if explicitly set (for programmatic API access)
    if (apiKey && req.headers.has('X-Use-Api-Key')) {
      headers = headers.set('X-Api-Key', apiKey);
      headers = headers.delete('Authorization');
    }
    
    // Rewrite URL to use the backend API URL in production
    let url = req.url;
    if (environment.production && !url.startsWith('http')) {
      url = environment.apiUrl + url;
    }
    
    const cloned = req.clone({ headers, url });
    return next(cloned);
  }

  return next(req);
};
