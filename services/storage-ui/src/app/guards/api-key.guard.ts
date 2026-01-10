import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const apiKeyGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Only check for session authentication
  if (!authService.isAuthenticated()) {
    router.navigate(['/setup']);
    return false;
  }

  return true;
};
