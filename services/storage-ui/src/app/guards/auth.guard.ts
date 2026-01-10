import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/setup']);
  return false;
};

export const adminGuard = () => {
  const router = inject(Router);
  const adminToken = localStorage.getItem('admin_token');

  if (adminToken) {
    return true;
  }

  router.navigate(['/']);
  return false;
};
