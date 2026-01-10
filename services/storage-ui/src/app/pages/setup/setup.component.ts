import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AccountService } from '../../services/account.service';
import { UsernameValidatorService, DebouncedValidation } from '../../services/username-validator.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-[80vh] flex items-center justify-center">
      <div class="card p-8 max-w-md w-full">
        <div class="text-center mb-6">
          <svg class="w-16 h-16 text-primary-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
          </svg>
          <h1 class="text-2xl font-bold text-gray-900">S3 Storage Platform</h1>
        </div>

        <div class="flex border-b border-gray-200 mb-6">
          <button 
            (click)="activeTab.set('login')"
            [class]="activeTab() === 'login' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
            class="flex-1 py-3 text-center font-medium border-b-2 transition-colors"
          >
            Login
          </button>
          <button 
            (click)="activeTab.set('signup')"
            [class]="activeTab() === 'signup' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
            class="flex-1 py-3 text-center font-medium border-b-2 transition-colors"
          >
            Sign Up
          </button>
        </div>

        @if (activeTab() === 'login') {
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input 
                type="text"
                [(ngModel)]="username"
                class="input"
                placeholder="Enter your username"
                (keyup.enter)="login()"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password"
                [(ngModel)]="password"
                class="input"
                placeholder="Enter your password"
                (keyup.enter)="login()"
              />
            </div>
            <button (click)="login()" [disabled]="loading()" class="btn-primary w-full">
              {{ loading() ? 'Logging in...' : 'Login' }}
            </button>
          </div>
        } @else {
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input 
                type="text"
                [(ngModel)]="username"
                (input)="onUsernameChange()"
                class="input"
                placeholder="Choose a username"
                [class]="getUsernameInputClass()"
              />
              @if (usernameValidation().isValidating) {
                <div class="mt-1 text-sm text-gray-500 flex items-center gap-1">
                  <div class="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                  Checking username...
                </div>
              }
              @if (usernameValidation().result && !usernameValidation().isValidating) {
                <div class="mt-1 text-sm" [class]="getUsernameMessageClass()">
                  {{ usernameValidation().result?.reason }}
                </div>
              }
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password"
                [(ngModel)]="password"
                class="input"
                placeholder="Choose a password (min 6 characters)"
              />
            </div>
            <button 
              (click)="signup()" 
              [disabled]="loading()"
              class="btn-primary w-full disabled:opacity-50"
            >
              {{ loading() ? 'Creating Account...' : 'Create Account' }}
            </button>
          </div>
        }

        @if (error()) {
          <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {{ error() }}
          </div>
        }

        @if (success()) {
          <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {{ success() }}
          </div>
        }
        <div class="mt-6 text-center">
          <p class="text-gray-600 text-sm">
            Need to access admin settings? 
            <a routerLink="/admin-login" class="text-primary-600 hover:text-primary-700 font-medium">
              Admin Login
            </a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class SetupComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private accountService = inject(AccountService);
  private router = inject(Router);
  private usernameValidator = inject(UsernameValidatorService);

  username = '';
  password = '';
  
  loading = signal(false);
  error = signal('');
  success = signal('');
  activeTab = signal<'login' | 'signup'>('login');
  
  usernameValidation = signal<DebouncedValidation>({
    username: '',
    isValidating: false
  });
  
  private validationSubscription: Subscription | null = null;

  login(): void {
    if (!this.username.trim() || !this.password.trim()) {
      this.error.set('Please enter username and password');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.authService.login(this.username, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        // Check if user has an API key
        this.checkApiKeyAndRedirect();
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Login failed');
        this.loading.set(false);
      }
    });
  }

  private checkApiKeyAndRedirect(): void {
    // Check if user has an API key by trying to access account info
    this.accountService.getAccount().subscribe({
      next: (account: any) => {
        if (account.api_key) {
          // User has API key, redirect to buckets
          this.router.navigate(['/buckets']);
        } else {
          // No API key, redirect to create one
          this.router.navigate(['/api-key']);
        }
      },
      error: () => {
        // If we can't get account info, assume no API key and redirect to create one
        this.router.navigate(['/api-key']);
      }
    });
  }

  signup(): void {
    if (!this.username.trim()) {
      this.error.set('Please enter a username');
      return;
    }
    if (this.password.length < 6) {
      this.error.set('Password must be at least 6 characters');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.authService.signup(this.username, this.password, 'free').subscribe({
      next: () => {
        this.success.set('Account created successfully! Please login to continue.');
        this.loading.set(false);
        setTimeout(() => {
          this.activeTab.set('login');
          this.username = '';
          this.password = '';
        }, 2000);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to create account');
        this.loading.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.validationSubscription = this.usernameValidator.getValidation$().subscribe(result => {
      this.usernameValidation.set(result);
    });
  }

  ngOnDestroy(): void {
    if (this.validationSubscription) {
      this.validationSubscription.unsubscribe();
    }
  }

  onUsernameChange(): void {
    this.usernameValidator.validateUsername(this.username);
  }

  getUsernameInputClass(): string {
    const validation = this.usernameValidation();
    if (validation.result && !validation.isValidating) {
      return validation.result.available ? 'input border-green-500' : 'input border-red-500';
    }
    return 'input';
  }

  getUsernameMessageClass(): string {
    const validation = this.usernameValidation();
    if (validation.result) {
      return validation.result.available ? 'text-green-600' : 'text-red-600';
    }
    return '';
  }
}
