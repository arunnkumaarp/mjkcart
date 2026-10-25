import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Order } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

const STEPS = [
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'packed', label: 'Packed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
];

/** One order: for UPI orders waiting on payment, the QR code, the amount and where to send the reference. */
@Component({
  selector: 'mjk-order-page',
  imports: [TopBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-page.html',
  styleUrl: './order-page.css',
})
export class OrderPage {
  private api = inject(Api).client;
  readonly shop = inject(Store).shop;
  readonly money = money;
  readonly steps = STEPS;

  /** The order number from the address, e.g. MJK000123. */
  readonly number = input.required<string>();

  readonly order = signal<Order | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly reference = signal('');
  readonly screenshot = signal<File | null>(null);
  readonly sending = signal(false);
  readonly error = signal('');

  readonly cancelOpen = signal(false);
  readonly cancelReason = signal('');
  readonly cancelling = signal(false);
  readonly cancelError = signal('');
  readonly copied = signal(false);

  /** The buyer still has to pay, or to send proof again after a rejection. */
  readonly needsPayment = computed(() => {
    const o = this.order();
    return !!o && o.payment_method === 'upi' && o.status === 'payment_pending' && o.payment?.status !== 'submitted';
  });
  readonly checking = computed(() => {
    const o = this.order();
    return !!o && o.status === 'payment_pending' && o.payment?.status === 'submitted';
  });
  readonly stepIndex = computed(() => STEPS.findIndex((s) => s.status === this.order()?.status));
  /** Opens the buyer's UPI app with the amount and order number filled in (works on phones). */
  readonly upiLink = computed(() => {
    const o = this.order();
    const s = this.shop();
    if (!o || !s?.upi_id) return '';
    // UPI apps expect the @ in the UPI ID as is and spaces as %20, so this isn't URLSearchParams.
    const part = (v: string) => encodeURIComponent(v).replace(/%40/g, '@');
    const params = { pa: s.upi_id, pn: s.shop_name ?? 'Shop', am: o.total, cu: 'INR', tn: o.number ?? '' };
    return 'upi://pay?' + Object.entries(params).map(([k, v]) => `${k}=${part(v)}`).join('&');
  });

  constructor() {
    effect(() => void this.load(this.number()));
  }

  async load(number = this.number()) {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { data } = await this.api.GET('/api/v1/orders/{number}/', { params: { path: { number } } });
      this.order.set(data ?? null);
      this.failed.set(!data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  async cancel() {
    const o = this.order();
    if (!o?.number || this.cancelling()) return;
    this.cancelling.set(true);
    this.cancelError.set('');
    try {
      const { data, error } = await this.api.POST('/api/v1/orders/{number}/cancel/', {
        params: { path: { number: o.number } },
        body: { reason: this.cancelReason().trim() },
      });
      if (data) {
        this.order.set(data);
        this.cancelOpen.set(false);
      } else {
        this.cancelError.set(firstMessage(error) ?? 'We couldn’t cancel it. Please try again.');
      }
    } catch {
      this.cancelError.set('We can’t reach the shop right now. Please try again.');
    }
    this.cancelling.set(false);
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* the number is on screen to copy by hand */
    }
  }

  onReference(value: string) {
    const clean = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 30).toUpperCase();
    this.reference.set(clean);
    this.error.set('');
    return clean;
  }

  onScreenshot(input: HTMLInputElement) {
    const f = input.files?.[0] ?? null;
    this.error.set('');
    if (f && f.size > 5 * 1024 * 1024) {
      this.error.set('That screenshot is over 5 MB. Please pick a smaller one.');
      input.value = '';
      return;
    }
    this.screenshot.set(f);
  }

  async sendProof(event: Event) {
    event.preventDefault();
    const o = this.order();
    if (!o?.number || this.sending()) return;
    const reference = this.reference();
    const shot = this.screenshot();
    if (!reference && !shot) return this.error.set('Type the UPI reference number, or add a screenshot of the payment.');
    if (reference && reference.length < 6) return this.error.set('The UPI reference is usually 12 digits. Please check it.');
    this.sending.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.api.POST('/api/v1/orders/{number}/payment/', {
        params: { path: { number: o.number } },
        body: {},
        bodySerializer: () => {
          const form = new FormData();
          if (reference) form.append('reference', reference);
          if (shot) form.append('screenshot', shot);
          return form;
        },
      });
      if (data) {
        this.order.set(data);
        this.reference.set('');
        this.screenshot.set(null);
      } else {
        this.error.set(firstMessage(error) ?? 'We couldn’t send that. Please try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.sending.set(false);
  }
}

function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const value of Object.values(error)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}
