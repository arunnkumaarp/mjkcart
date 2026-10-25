import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

/** Pages behind the login: anyone logged out goes to the login page. */
export const loggedIn: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.loggedIn() || inject(Router).parseUrl('/');
};

/** The admin area: buyers are sent to the shop. */
export const staffOnly: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.parseUrl('/');
  return auth.isStaff() || router.parseUrl('/shop');
};

/** Sales and buyer details are for admins only, not staff. */
export const adminOnly: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.parseUrl('/');
  return auth.user()?.role === 'admin' || router.parseUrl(auth.home());
};

/** The cart is for buyers; the shop team has nothing to buy and goes to the admin desk. */
export const buyersOnly: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.parseUrl('/');
  return !auth.isStaff() || router.parseUrl('/admin');
};

/** The login page: someone already logged in goes straight to their home. */
export const loggedOut: CanActivateFn = () => {
  const auth = inject(Auth);
  return !auth.loggedIn() || inject(Router).parseUrl(auth.home());
};
