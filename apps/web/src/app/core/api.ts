import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { createApi } from '@mjkcart/api';

import { API_URL } from '../config';
import { Auth } from './auth';
import { Cart } from './cart';

/** Renew this many seconds before the access token runs out, so a request never leaves with a dead one. */
const EARLY = 60;

@Injectable({ providedIn: 'root' })
export class Api {
  private auth = inject(Auth);
  private router = inject(Router);
  private injector = inject(Injector);
  readonly client = createApi({ baseUrl: API_URL, getToken: () => this.auth.token() });
  /** One renewal at a time: requests that find the token stale all wait on the same one. */
  private renewing: Promise<boolean> | null = null;

  constructor() {
    this.client.use({
      onRequest: async ({ request }) => {
        const token = this.auth.token();
        if (token && expiresSoon(token) && !request.url.includes('/auth/')) {
          if (await this.renew()) request.headers.set('Authorization', `Bearer ${this.auth.token()}`);
          else request.headers.delete('Authorization');
        }
        return request;
      },
      onResponse: ({ request, response }) => {
        // The session can't be renewed (logged out elsewhere, or 30 days passed): back to the login page.
        if (response.status === 401 && request.headers.has('Authorization')) this.endSession();
        return response;
      },
    });
  }

  private renew() {
    this.renewing ??= this.fetchAccess().finally(() => (this.renewing = null));
    return this.renewing;
  }

  private async fetchAccess() {
    const refresh = this.auth.refreshToken();
    if (refresh) {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (res.ok) {
          this.auth.setAccess(((await res.json()) as { access: string }).access);
          return true;
        }
      } catch {
        return false; // offline: keep the session and let the page show its own error
      }
    }
    this.endSession();
    return false;
  }

  private endSession() {
    if (!this.auth.token()) return;
    this.auth.logout();
    // Cart needs Api, so it is looked up here rather than injected.
    this.injector.get(Cart).reset();
    void this.router.navigateByUrl('/');
  }
}

/** True when the JWT's expiry is under a minute away, or it can't be read. */
export function expiresSoon(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return !payload.exp || payload.exp - EARLY < Date.now() / 1000;
  } catch {
    return true;
  }
}
