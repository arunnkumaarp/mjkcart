import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { expiresSoon } from './api';
import { Auth } from './auth';

/** A JWT with this expiry, signed with nothing: only the middle part matters to the app. */
function jwt(exp?: number) {
  const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${part({ alg: 'HS256' })}.${part(exp === undefined ? {} : { exp })}.signature`;
}

describe('Auth', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps the session across a page reload and clears it on logout', () => {
    const auth = TestBed.inject(Auth);
    auth.setSession('a1', 'r1', { id: 7, email: 'meena@example.com', first_name: 'Meena', phone: '', role: 'customer' });
    expect(auth.loggedIn()).toBe(true);
    expect(auth.isStaff()).toBe(false);
    expect(auth.home()).toBe('/shop');

    // A new Auth reads what the old one saved, as a fresh page load would.
    TestBed.resetTestingModule();
    const again = TestBed.inject(Auth);
    expect(again.token()).toBe('a1');
    expect(again.refreshToken()).toBe('r1');
    expect(again.user()?.email).toBe('meena@example.com');

    again.setAccess('a2');
    expect(again.token()).toBe('a2');

    again.logout();
    expect(again.loggedIn()).toBe(false);
    expect(again.refreshToken()).toBeNull();
    expect(localStorage.getItem('mjk.access')).toBe('null');
  });

  it('sends staff and admins to the admin desk', () => {
    const auth = TestBed.inject(Auth);
    for (const role of ['staff', 'admin'] as const) {
      auth.setSession('a', 'r', { id: 1, email: 'x@example.com', first_name: '', phone: '', role });
      expect(auth.isStaff()).toBe(true);
      expect(auth.home()).toBe('/admin');
    }
  });
});

describe('expiresSoon', () => {
  const now = Math.floor(Date.now() / 1000);

  it('renews a token that has run out or is about to', () => {
    expect(expiresSoon(jwt(now - 10))).toBe(true);
    expect(expiresSoon(jwt(now + 30))).toBe(true);
  });

  it('keeps a token with time left', () => {
    expect(expiresSoon(jwt(now + 3600))).toBe(false);
  });

  it('treats a token it cannot read as expired', () => {
    expect(expiresSoon('not-a-token')).toBe(true);
    expect(expiresSoon(jwt())).toBe(true);
  });
});
