import { Routes } from '@angular/router';

import { Home } from './pages/home/home';

export const routes: Routes = [
  { path: '', component: Home, title: 'MJK Cart' },
  // Product, cart, checkout, login and order pages come next; until then their links land home.
  { path: '**', redirectTo: '' },
];
