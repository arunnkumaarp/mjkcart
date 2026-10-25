import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { StaffPayment } from '@mjkcart/api';

import { Api } from '../../core/api';
import { money } from '../../shared/money';
import { DeskCounts } from './desk-counts';

/** UPI payments buyers say they've made. Staff find each one in the shop's account, then verify or reject it. */
@Component({
  selector: 'mjk-payments-review',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="pay-review-title">
      <div class="field__head">
        <h2 id="pay-review-title">Payments to check</h2>
        <button type="button" class="link" (click)="load()" [disabled]="loading()">Refresh</button>
      </div>
      <p class="hint">Find each payment in the shop’s bank or UPI app by its amount and reference, then verify it. Verifying confirms the order for packing.</p>

      @if (loading() && !payments().length) {
        <p class="hint" role="status">Fetching payments…</p>
      } @else if (failed()) {
        <p class="error" role="alert">We couldn’t load the payments. Press Refresh to try again.</p>
      } @else if (!payments().length) {
        <p class="hint">Nothing to check right now.</p>
      } @else {
        <ul class="list" role="list">
          @for (p of payments(); track p.id) {
            <li class="pay">
              <div class="pay__about">
                <p><strong class="num">{{ p.order_number }}</strong> · <strong class="num">{{ money(p.order_total) }}</strong></p>
                <p class="hint">{{ p.customer_email }} · sent {{ p.submitted_at | date: 'd MMM, h:mm a' }}</p>
                <p>
                  Reference: <strong class="num">{{ p.reference || 'none given' }}</strong>
                  @if (p.screenshot) {
                    · <a class="link" [href]="p.screenshot" target="_blank" rel="noopener">See screenshot</a>
                  }
                </p>
              </div>
              @if (rejecting() === p.id) {
                <form class="reject" (submit)="reject($event, p)" novalidate>
                  <label [for]="'why-' + p.id">Why can’t you find it? The buyer sees this.</label>
                  <input
                    [id]="'why-' + p.id"
                    type="text"
                    maxlength="200"
                    placeholder="No payment with this reference in our account"
                    [value]="reason()"
                    (input)="reason.set($any($event.target).value)"
                  />
                  <div class="actions">
                    <button class="button" type="submit" [disabled]="working() === p.id">Reject payment</button>
                    <button type="button" class="link" (click)="rejecting.set(null)">Cancel</button>
                  </div>
                </form>
              } @else {
                <div class="actions">
                  <button class="button" type="button" (click)="verify(p)" [disabled]="working() === p.id">
                    {{ working() === p.id ? 'Saving…' : 'Verify, money received' }}
                  </button>
                  <button type="button" class="link" (click)="startReject(p)">Can’t find it</button>
                </div>
              }
            </li>
          }
        </ul>
      }
      <p class="note" role="status">{{ note() }}</p>
      <p class="error" role="alert">{{ error() }}</p>
    </section>
  `,
  styleUrl: './admin.css',
  styles: `
    .list { list-style: none; margin: 0; padding: 0; display: grid; }
    .pay { display: grid; gap: 12px; padding: 14px 0; border-bottom: 2px dotted var(--paper-step); }
    .pay__about { display: grid; gap: 2px; font-size: var(--step-small); }
    .pay__about strong { font-size: var(--step-body); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
    .actions .button { margin: 0; }
    .reject { display: grid; gap: 8px; }
    .link {
      display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: none; cursor: pointer;
      font-size: var(--step-small); font-weight: 600; color: var(--paper-ink); text-decoration: underline; text-underline-offset: 4px;
    }
    .pay__about .link { min-height: 0; }
  `,
})
export class PaymentsReview {
  private api = inject(Api).client;
  private counts = inject(DeskCounts, { optional: true });
  readonly money = money;

  readonly payments = signal<StaffPayment[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly working = signal<number | null>(null);
  readonly rejecting = signal<number | null>(null);
  readonly reason = signal('');
  readonly note = signal('');
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { data } = await this.api.GET('/api/v1/staff/payments/', { params: { query: { status: 'submitted' } } });
      this.payments.set(data?.results ?? []);
      this.failed.set(!data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  startReject(p: StaffPayment) {
    this.rejecting.set(p.id);
    this.reason.set('');
    this.error.set('');
  }

  async verify(p: StaffPayment) {
    await this.review(p, () => this.api.POST('/api/v1/staff/payments/{id}/verify/', { params: { path: { id: p.id } } }),
      `${p.order_number} is paid and confirmed for packing.`);
  }

  async reject(event: Event, p: StaffPayment) {
    event.preventDefault();
    const reason = this.reason().trim();
    if (!reason) return this.error.set('Tell the buyer why, so they can fix it.');
    await this.review(
      p,
      () => this.api.POST('/api/v1/staff/payments/{id}/reject/', { params: { path: { id: p.id } }, body: { reason } }),
      `${p.order_number}: the buyer is asked to send the payment details again.`,
    );
  }

  private async review(p: StaffPayment, call: () => Promise<{ data?: unknown; error?: unknown }>, done: string) {
    this.working.set(p.id);
    this.error.set('');
    this.note.set('');
    try {
      const { data, error } = await call();
      if (data) {
        this.payments.update((list) => list.filter((x) => x.id !== p.id));
        this.rejecting.set(null);
        this.note.set(done);
        void this.counts?.refresh();
      } else {
        const detail = (error as { detail?: string } | undefined)?.detail;
        this.error.set(detail ?? 'That didn’t save. Please try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.working.set(null);
  }
}
