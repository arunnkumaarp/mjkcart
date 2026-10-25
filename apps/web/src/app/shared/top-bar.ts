import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AppInstall } from '../core/app-install';
import { Auth } from '../core/auth';
import { Cart } from '../core/cart';
import { Store } from '../core/store';

/** The bar over every logged-in page; on a phone its links become a tab bar along the bottom. */
@Component({
  selector: 'mjk-top-bar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="bar" aria-label="Main">
      <a class="bar__mark" [routerLink]="auth.isStaff() ? '/admin' : '/shop'">{{ shop()?.shop_name ?? 'MJK Cart' }}</a>
      <div class="bar__links">
        @if (auth.isStaff()) {
          <a routerLink="/admin" routerLinkActive="is-here" [routerLinkActiveOptions]="{ exact: true }">Admin desk</a>
          @if (auth.user()?.role === 'admin') {
            <a routerLink="/admin/sales" routerLinkActive="is-here">Sales</a>
          }
        }
        <a routerLink="/shop" routerLinkActive="is-here">Shop</a>
        @if (!auth.isStaff()) {
          <a routerLink="/orders" routerLinkActive="is-here">My orders</a>
          <a routerLink="/cart" routerLinkActive="is-here">
            Cart <span class="num">({{ cart.count() }})</span>
          </a>
        }
        <a routerLink="/account" routerLinkActive="is-here">Account</a>
        <button type="button" (click)="logout()">Log out</button>
      </div>
      @if (app.updateReady()) {
        <button type="button" class="pill" (click)="app.update()">New version · Update</button>
      } @else if (app.canInstall()) {
        <button type="button" class="pill" (click)="app.install()">Install app</button>
      }
    </nav>

    <!-- On a phone the links move to a tab bar along the bottom, within reach of the thumb. -->
    <nav class="dock" aria-label="Main, on phones">
      @if (auth.isStaff()) {
        <a routerLink="/admin" routerLinkActive="is-here" [routerLinkActiveOptions]="{ exact: true }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>Desk
        </a>
        @if (auth.user()?.role === 'admin') {
          <a routerLink="/admin/sales" routerLinkActive="is-here">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>Sales
          </a>
        }
      }
      <a routerLink="/shop" routerLinkActive="is-here">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" /></svg>Shop
      </a>
      @if (!auth.isStaff()) {
        <a routerLink="/orders" routerLinkActive="is-here">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" /></svg>Orders
        </a>
        <a routerLink="/cart" routerLinkActive="is-here" [attr.aria-label]="'Cart, ' + cart.count() + ' items'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2 11h11l2-8H6M9 20h.01M17 20h.01" /></svg>Cart
          @if (cart.count()) {
            <span class="dock__n num">{{ cart.count() }}</span>
          }
        </a>
      }
      <a routerLink="/account" routerLinkActive="is-here">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>Account
      </a>
    </nav>
  `,
  styles: `
    .bar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px;
      padding: 12px var(--margin); font-size: var(--step-small); font-weight: 500;
    }
    .bar__mark { font-size: var(--step-lead); font-weight: 600; letter-spacing: -0.02em; text-decoration: none; margin-right: auto; }
    .bar__links { display: flex; flex-wrap: wrap; align-items: center; gap: 0 20px; }
    a, button {
      display: inline-flex; align-items: center; gap: 0.3em; min-height: 44px;
      padding: 0; border: 0; background: none; cursor: pointer; text-decoration: none;
      font-size: inherit; font-weight: inherit;
    }
    .bar a:hover, .bar button:hover, .bar .is-here { text-decoration: underline; text-underline-offset: 4px; }
    .is-here { font-weight: 600; }
    .pill { min-height: 36px; padding: 0 12px; background: var(--ink); color: var(--bg); font-weight: 600; }
    .bar .pill:hover { text-decoration: none; }

    .dock { display: none; }
    @media (max-width: 719px) {
      .bar__links { display: none; }
      .dock {
        position: fixed; z-index: 10; left: 0; right: 0; bottom: 0;
        display: flex; background: var(--ink); padding-bottom: env(safe-area-inset-bottom);
      }
      .dock a {
        position: relative; flex: 1; flex-direction: column; justify-content: center; gap: 2px; min-height: 60px;
        color: var(--ink-soft); font-size: 12px; font-weight: 600;
      }
      .dock a.is-here { color: var(--bg); }
      .dock svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
      .dock__n {
        position: absolute; top: 6px; left: calc(50% + 6px); min-width: 18px; padding: 0 4px; text-align: center;
        background: var(--bg); color: var(--ink); font-size: 11px; line-height: 18px;
      }
    }
  `,
})
export class TopBar {
  readonly auth = inject(Auth);
  readonly app = inject(AppInstall);
  readonly cart = inject(Cart);
  readonly shop = inject(Store).shop;
  private router = inject(Router);

  logout() {
    this.auth.logout();
    this.cart.reset();
    void this.router.navigateByUrl('/');
  }
}
