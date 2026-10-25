import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Order } from '@mjkcart/api';

import { Api } from '../../core/api';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

/** The buyer's orders, newest first, each with what it's waiting on. */
@Component({
  selector: 'mjk-orders-page',
  imports: [TopBar, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mjk-top-bar />
    <main class="page">
      <h1>Your orders</h1>
      <section class="field" aria-label="Orders">
        @if (loading()) {
          <p class="hint" role="status">Fetching your orders…</p>
        } @else if (failed()) {
          <div role="alert">
            <p class="hint">We couldn’t load your orders.</p>
            <button type="button" class="button" (click)="load()">Try again</button>
          </div>
        } @else if (!orders().length) {
          <p class="hint">No orders yet.</p>
          <a class="button" routerLink="/shop">Go to the shop</a>
        } @else {
          <ul class="list" role="list">
            @for (o of orders(); track o.number) {
              <li>
                <a [routerLink]="['/orders', o.number]">
                  <span class="num strong">{{ o.number }}</span>
                  <span class="hint">{{ o.created_at | date: 'd MMM y' }} · {{ o.items.length }} {{ o.items.length === 1 ? 'item' : 'items' }}</span>
                  <span class="status" [class.status--todo]="o.status === 'payment_pending'">
                    {{ o.status === 'payment_pending' && o.payment?.status !== 'submitted' ? 'Pay now' : o.status_label }}
                  </span>
                  <span class="num strong">{{ money(o.total) }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </section>
    </main>
  `,
  styles: `
    .page { padding: 0 var(--margin) 96px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: var(--step-head); padding: 40px 0 32px; }
    .field { background: var(--paper); color: var(--paper-ink); padding: var(--gutter); display: grid; gap: 16px; justify-items: start; }
    .hint { font-size: var(--step-small); color: var(--paper-muted); }
    .list { list-style: none; margin: 0; padding: 0; width: 100%; }
    .list a {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px 20px; align-items: center;
      min-height: 64px; padding: 12px 0; border-bottom: 2px dotted var(--paper-step); text-decoration: none;
    }
    .list a:hover .strong:first-child { text-decoration: underline; text-underline-offset: 4px; }
    .strong { font-weight: 600; }
    .status { font-size: var(--step-small); font-weight: 600; }
    .status--todo { background: var(--ink); color: var(--bg); padding: 4px 10px; }
    @media (max-width: 600px) { .list a { grid-template-columns: 1fr auto; } }
  `,
})
export class OrdersPage {
  private api = inject(Api).client;
  readonly money = money;
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { data } = await this.api.GET('/api/v1/orders/');
      this.orders.set(data ?? []);
      this.failed.set(!data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }
}
