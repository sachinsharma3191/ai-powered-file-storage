import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private hasUserInteracted = signal(false);
  private logoutTimeout: any = null;
  private readonly LOGOUT_DELAY = 1000; // 1 second delay before logout

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.initializeSessionMonitoring();
  }

  private initializeSessionMonitoring(): void {
    // Track user interaction
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, this.handleUserInteraction.bind(this), true);
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Handle browser/tab close
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    
    // Handle page unload
    window.addEventListener('unload', this.handleUnload.bind(this));
  }

  private handleUserInteraction(): void {
    this.hasUserInteracted.set(true);
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Tab is hidden (user switched tabs or minimized browser)
      this.scheduleLogout();
    } else {
      // Tab is visible again
      this.cancelScheduledLogout();
    }
  }

  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    // User is closing the tab or browser
    this.performLogout();
    
    // Show a confirmation message (optional, but browsers may not always show it)
    event.preventDefault();
    event.returnValue = 'Are you sure you want to leave? You will be logged out.';
  }

  private handleUnload(): void {
    // Final cleanup when page is unloading
    this.performLogout();
  }

  private scheduleLogout(): void {
    // Cancel any existing timeout
    this.cancelScheduledLogout();
    
    // Schedule logout after a delay
    this.logoutTimeout = setTimeout(() => {
      this.performLogout();
    }, this.LOGOUT_DELAY);
  }

  private cancelScheduledLogout(): void {
    if (this.logoutTimeout) {
      clearTimeout(this.logoutTimeout);
      this.logoutTimeout = null;
    }
  }

  private performLogout(): void {
    // Only logout if user was previously authenticated
    if (this.authService.isAuthenticated()) {
      // Clear all session data
      this.authService.logout();
      
      // Clear any additional session storage
      sessionStorage.clear();
      
      // Clear any additional local storage items related to session
      localStorage.removeItem('admin_token');
      
      // Notify backend about session end (optional)
      this.notifySessionEnd();
    }
  }

  private notifySessionEnd(): void {
    // Send a beacon request to notify backend about session end
    // This uses sendBeacon which works even during page unload
    const token = this.authService.getToken();
    if (token) {
      const data = new FormData();
      data.append('session_token', token);
      
      navigator.sendBeacon('/api/v1/auth/logout', data);
    }
  }

  // Public method for manual logout
  logout(): void {
    this.performLogout();
    this.router.navigate(['/setup']);
  }

  // Check if user has interacted with the page
  hasInteracted(): boolean {
    return this.hasUserInteracted();
  }

  // Cleanup method to be called when service is destroyed
  destroy(): void {
    // Remove event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.removeEventListener(event, this.handleUserInteraction.bind(this), true);
    });
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    window.removeEventListener('unload', this.handleUnload.bind(this));
    
    // Clear any pending timeouts
    this.cancelScheduledLogout();
  }
}
