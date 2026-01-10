import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';

export interface UsernameValidationResult {
  available: boolean;
  reason?: string;
}

interface CachedValidationResult {
  result: UsernameValidationResult;
  timestamp: number;
}

export interface DebouncedValidation {
  username: string;
  isValidating: boolean;
  result?: UsernameValidationResult;
}

@Injectable({
  providedIn: 'root'
})
export class UsernameValidatorService {
  constructor(private http: HttpClient) {
    this.setupDebouncedValidation();
  }
  
  private validationCache = new Map<string, CachedValidationResult>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  private validationSubject = new Subject<string>();
  private debouncedValidation$ = new BehaviorSubject<DebouncedValidation>({
    username: '',
    isValidating: false
  });

  // Public method to trigger validation
  validateUsername(username: string): void {
    this.validationSubject.next(username);
  }

  // Observable for debounced validation results
  getValidation$(): Observable<DebouncedValidation> {
    return this.debouncedValidation$.asObservable();
  }

  // Direct validation without debouncing (for final form submission)
  validateUsernameDirect(username: string): Observable<UsernameValidationResult> {
    // Check cache first
    const cached = this.getCachedResult(username);
    if (cached) {
      return of(cached);
    }

    return this.http.get<UsernameValidationResult>(`/api/v1/auth/check_username?username=${encodeURIComponent(username)}`)
      .pipe(
        map((response: UsernameValidationResult) => {
          // Cache the result
          this.cacheResult(username, response);
          return response;
        }),
        catchError((error: any) => {
          const errorResult: UsernameValidationResult = {
            available: false,
            reason: 'Failed to validate username'
          };
          return of(errorResult);
        })
      );
  }

  private setupDebouncedValidation(): void {
    this.validationSubject.pipe(
      // Wait for user to stop typing (300ms debounce)
      debounceTime(300),
      // Only validate when username actually changes
      distinctUntilChanged(),
      // Switch to validation logic
      switchMap(username => {
        // Don't validate empty or very short usernames
        if (username.length < 3) {
          return of({
            username,
            isValidating: false,
            result: {
              available: false,
              reason: 'Username must be at least 3 characters'
            }
          });
        }

        // Check cache first
        const cached = this.getCachedResult(username);
        if (cached) {
          return of({
            username,
            isValidating: false,
            result: cached
          });
        }

        // Show validating state
        this.debouncedValidation$.next({
          username,
          isValidating: true
        });

        // Perform actual validation
        return this.http.get<UsernameValidationResult>(`/api/v1/auth/check_username?username=${encodeURIComponent(username)}`)
          .pipe(
            map(response => {
              // Cache the result
              this.cacheResult(username, response);
              
              return {
                username,
                isValidating: false,
                result: response
              };
            }),
            catchError((error: any) => {
              const errorResult: UsernameValidationResult = {
                available: false,
                reason: 'Failed to validate username'
              };
              
              return of({
                username,
                isValidating: false,
                result: errorResult
              });
            })
          );
      })
    ).subscribe((result: DebouncedValidation) => {
      this.debouncedValidation$.next(result);
    });

    // Clean up old cache entries periodically
    timer(0, 60000).subscribe(() => {
      this.cleanExpiredCache();
    });
  }

  private getCachedResult(username: string): UsernameValidationResult | null {
    const cacheKey = username.toLowerCase();
    const cached = this.validationCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.result;
    }
    
    return null;
  }

  private cacheResult(username: string, result: UsernameValidationResult): void {
    const cacheKey = username.toLowerCase();
    this.validationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    
    for (const [key, value] of this.validationCache.entries()) {
      if ((now - value.timestamp) >= this.CACHE_TTL) {
        this.validationCache.delete(key);
      }
    }
  }

  // Clear cache (useful for testing or manual refresh)
  clearCache(): void {
    this.validationCache.clear();
  }
}
