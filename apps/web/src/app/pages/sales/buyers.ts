import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { components } from '@mjkcart/api';

import { Api } from '../../core/api';
import { money } from '../../shared/money';

type Buyer = components['schemas']['Buyer'];

/** Every buyer account with what they've bought (all time), biggest spenders first, with search. */
@Component({
  selector: 'mjk-buyers',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="buyers-title">
      <div class="head">
        <h2 id="buyers-title">Buyers</h2>
        @if (count() !== null) {
          <p class="hint num">{{ count() }} {{ count() === 1 ? 'account' : 'accounts' }} · all time</p>
        }
      </div>
      <form class="search" role="search" (submit)="search($event)">
        <label for="buyer-q" class="visually-hidden">Search buyers</label>
        <input id="buyer-q" type="search" placeholder="Search name, email or phone" [value]="q()" (input)="q.set($any($event.target).value)" />
        <button class="button" type="submit">Search</button>
      </form>

      @if (loading() && !buyers().length) {
        <p class="hint" role="status">Fetching buyers…</p>
      } @else if (failed()) {
        <p class="error" role="alert">We couldn’t load the buyers. <button type="button" class="link" (click)="load(true)">Try again</button></p>
      } @else if (!buyers().length) {
        <p class="hint">{{ q() ? 'No buyer matches that.' : 'No buyer accounts yet.' }}</p>
      } @else {
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Buyer</th>
                <th scope="col">Phone</th>
                <th scope="col" class="r">Orders</th>
                <th scope="col" class="r">Spent</th>
                <th scope="col">Last order</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              @for (b of buyers(); track b.id) {
                <tr>
                  <td>
                    <strong>{{ b.name || '—' }}</strong><br /><span class="hint">{{ b.email }}</span>
                    @if (b.waiting_payment) {
                      <br /><span class="flag">{{ b.waiting_payment }} unpaid UPI {{ b.waiting_payment === 1 ? 'order' : 'orders' }}</span>
                    }
                  </td>
                  <td class="num">{{ b.phone || '—' }}</td>
                  <td class="num r">{{ b.orders }}</td>
                  <td class="num r"><strong>{{ money(b.spent) }}</strong></td>
                  <td>{{ b.last_order ? (b.last_order | date: 'd MMM y') : 'Never' }}</td>
                  <td>{{ b.joined | date: 'd MMM y' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (next()) {
          <button type="button" class="link" (click)="load(false)" [disabled]="loading()">
            {{ loading() ? 'Loading…' : 'Show more buyers' }}
          </button>
        }
      }
    </section>
  `,
  styleUrl: './sales.css',
  styles: `
    .search { display: flex; gap: 8px; }
    .search input {
      flex: 1; min-height: 44px; padding: 8px 10px; border: 2px solid var(--paper-ink); border-radius: 0;
      background: var(--paper); font-size: var(--step-body);
    }
    .search .button { min-height: 44px; }
    .flag { display: inline-block; margin-top: 4px; padding: 2px 8px; background: var(--ink); color: var(--bg); font-size: 12px; font-weight: 600; }
  `,
})
export class Buyers {
  private api = inject(Api).client;
  readonly money = money;

  readonly buyers = signal<Buyer[]>([]);
  readonly count = signal<number | null>(null);
  readonly next = signal(false);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly q = signal('');
  private page = 1;

  constructor() {
    void this.load(true);
  }

  search(event: Event) {
    event.preventDefault();
    void this.load(true);
  }

  async load(fresh: boolean) {
    this.page = fresh ? 1 : this.page + 1;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const q = this.q().trim();
      const { data } = await this.api.GET('/api/v1/staff/reports/buyers/', {
        params: { query: { page: this.page, page_size: 25, ...(q ? { q } : {}) } },
      });
      if (data) {
        this.buyers.update((list) => (fresh ? data.results : [...list, ...data.results]));
        this.count.set(data.count);
        this.next.set(!!data.next);
      } else {
        this.failed.set(true);
      }
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }
}
