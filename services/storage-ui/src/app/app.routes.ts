import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { apiKeyGuard } from './guards/api-key.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'buckets',
    pathMatch: 'full'
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.component').then(m => m.SetupComponent)
  },
  {
    path: 'admin-login',
    loadComponent: () => import('./pages/admin-login/admin-login.component').then(m => m.AdminLoginComponent)
  },
  {
    path: 'api-key',
    loadComponent: () => import('./pages/api-key/api-key.component').then(m => m.ApiKeyComponent),
    canActivate: [authGuard]
  },
  {
    path: 'buckets',
    loadComponent: () => import('./pages/buckets/buckets.component').then(m => m.BucketsComponent),
    canActivate: [authGuard, apiKeyGuard]
  },
  {
    path: 'buckets/:bucketName',
    loadComponent: () => import('./pages/objects/objects.component').then(m => m.ObjectsComponent),
    canActivate: [authGuard, apiKeyGuard]
  },
    {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard, apiKeyGuard]
  },
  {
    path: 'admin-panel-x7k9',
    loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent)
  }
];
