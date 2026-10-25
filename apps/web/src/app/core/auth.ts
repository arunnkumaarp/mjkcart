import { Injectable, computed, signal } from '@angular/core';
import type { User } from '@mjkcart/api';

import { storage } from './storage';

/** The logged-in person's tokens and profile. The API client reads the token from here. */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly token = signal<string | null>(storage.get<string | null>('mjk.access', null));
  readonly user = signal<User | null>(storage.get<User | null>('mjk.user', null));
  readonly loggedIn = computed(() => !!this.token() && !!this.user());
  /** Admins and staff run the shop; everyone else is a buyer. */
  readonly isStaff = computed(() => {
    const role = this.user()?.role;
    return role === 'admin' || role === 'staff';
  });

  setSession(access: string, refresh: string, user: User) {
    storage.set('mjk.access', access);
    storage.set('mjk.refresh', refresh);
    storage.set('mjk.user', user);
    this.token.set(access);
    this.user.set(user);
  }

  /** The long-lived token used to get a fresh access token when the current one runs out. */
  refreshToken() {
    return storage.get<string | null>('mjk.refresh', null);
  }

  setAccess(access: string) {
    storage.set('mjk.access', access);
    this.token.set(access);
  }

  setUser(user: User) {
    storage.set('mjk.user', user);
    this.user.set(user);
  }

  /** Where this person goes after logging in. */
  home() {
    return this.isStaff() ? '/admin' : '/shop';
  }

  logout() {
    storage.set('mjk.access', null);
    storage.set('mjk.refresh', null);
    storage.set('mjk.user', null);
    this.token.set(null);
    this.user.set(null);
  }
}
