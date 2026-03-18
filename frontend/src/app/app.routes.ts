import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'simulation',
    loadComponent: () =>
      import('./simulation/simulation.component').then(m => m.SimulationComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./chat/chat.component').then(m => m.ChatComponent),
  },
];
