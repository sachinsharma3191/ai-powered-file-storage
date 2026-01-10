import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-[80vh] flex items-center justify-center">
      <div class="card p-8 max-w-md w-full">
        <div class="text-center mb-6">
          <svg class="w-16 h-16 text-primary-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            <path d="M12 22v-4"/>
            <path d="M12 18l-2-2m2 2l2-2"/>
          </svg>
          <h1 class="text-2xl font-bold text-gray-900">Admin Login</h1>
          <p class="text-gray-600 mt-2">Enter admin password to access settings</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
            <input 
              type="password"
              [(ngModel)]="password"
              class="input"
              placeholder="Enter admin password"
              (keyup.enter)="login()"
            />
          </div>

          <button 
            (click)="login()" 
            [disabled]="loading()"
            class="btn-primary w-full disabled:opacity-50"
          >
            @if (loading()) {
              <span>Authenticating...</span>
            } @else {
              <span>Access Admin Panel</span>
            }
          </button>
        </div>

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
          <a routerLink="/setup" class="text-primary-600 hover:text-primary-700 text-sm">
            ← Back to User Login
          </a>
        </div>
      </div>
    </div>
  `
})
export class AdminLoginComponent {
  private adminService = inject(AdminService);
  private router = inject(Router);

  password = '';
  
  loading = signal(false);
  error = signal('');
  success = signal('');

  login(): void {
    if (!this.password.trim()) {
      this.error.set('Please enter admin password');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.adminService.login(this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Authentication successful!');
        setTimeout(() => {
          this.router.navigate(['/admin-panel-x7k9']);
        }, 1000);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Invalid admin password');
        this.loading.set(false);
      }
    });
  }
}
