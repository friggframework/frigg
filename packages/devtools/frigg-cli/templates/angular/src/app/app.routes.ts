import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(c => c.DashboardComponent)
  },
  {
    path: 'integrations',
    loadComponent: () => import('./pages/integrations/integrations.component').then(c => c.IntegrationsComponent)
  },
  {
    path: 'integrations/:id',
    loadComponent: () => import('./pages/integration-detail/integration-detail.component').then(c => c.IntegrationDetailComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then(c => c.SettingsComponent)
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(c => c.NotFoundComponent)
  }
];