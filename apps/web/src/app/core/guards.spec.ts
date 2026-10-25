import { TestBed } from '@angular/core/testing';
import { type CanActivateFn, provideRouter, Router, UrlTree } from '@angular/router';
import type { User } from '@mjkcart/api';
import { beforeEach, describe, expect, it } from 'vitest';

import { Auth } from './auth';
import { adminOnly, buyersOnly, loggedIn, loggedOut, staffOnly } from './guards';

type Role = User['role'] | null;

const person = (role: User['role']): User => ({ id: 1, email: `${role}@example.com`, first_name: '', phone: '', role });

/** Where the guard sends this person: true when they may stay, otherwise the address they're sent to. */
function visit(guard: CanActivateFn, role: Role) {
  const auth = TestBed.inject(Auth);
  if (role) auth.setSession('access', 'refresh', person(role));
  else auth.logout();
  const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
}

describe('page guards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  // Each row: guard, then where a logged-out person, a buyer, staff and an admin end up.
  const table: [string, CanActivateFn, Record<string, true | string>][] = [
    ['login page (loggedOut)', loggedOut, { none: true, customer: '/shop', staff: '/admin', admin: '/admin' }],
    ['shop (loggedIn)', loggedIn, { none: '/', customer: true, staff: true, admin: true }],
    ['cart, checkout, orders (buyersOnly)', buyersOnly, { none: '/', customer: true, staff: '/admin', admin: '/admin' }],
    ['admin desk (staffOnly)', staffOnly, { none: '/', customer: '/shop', staff: true, admin: true }],
    ['sales (adminOnly)', adminOnly, { none: '/', customer: '/shop', staff: '/admin', admin: true }],
  ];

  for (const [page, guard, expected] of table) {
    it(`${page} lets in or redirects each role`, () => {
      for (const role of ['none', 'customer', 'staff', 'admin'] as const) {
        expect(visit(guard, role === 'none' ? null : role), `${role} on ${page}`).toBe(expected[role]);
      }
    });
  }
});
