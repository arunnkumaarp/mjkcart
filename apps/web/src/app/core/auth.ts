import { Injectable, signal } from '@angular/core';

import { storage } from './storage';

/** The logged-in customer's tokens. Login screens come later; the API client reads the token from here. */
@Injectable({ providedIn: 'root' })
export class Auth {
  readonly token = signal<string | null>(storage.get<string | null>('mjk.access', null));

  setTokens(access: string, refresh: string) {
    storage.set('mjk.access', access);
    storage.set('mjk.refresh', refresh);
    this.token.set(access);
  }
}
