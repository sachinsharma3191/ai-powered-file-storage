import { Component, inject, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="bg-white border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <a routerLink="/buckets" class="flex items-center gap-2">
              <svg class="w-8 h-8 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
              </svg>
              <span class="text-xl font-bold text-gray-900">AI Powered File Storage</span>
            </a>
          </div>
          <div class="flex items-center gap-6">
            @if (authService.isAuthenticated()) {
              <a routerLink="/buckets" class="text-gray-600 hover:text-gray-900 font-medium">
                Folders
              </a>
              <a routerLink="/profile" class="text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                Account
              </a>
              <button (click)="logout()" class="text-red-600 hover:text-red-700 font-medium">
                Logout
              </button>
            }
          </div>
        </div>
      </div>
    </nav>
  `
})
export class NavbarComponent implements OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private sessionService = inject(SessionService);

  logout(): void {
    this.sessionService.logout();
    this.router.navigate(['/setup']);
  }

  ngOnDestroy(): void {
    this.sessionService.destroy();
  }
}
