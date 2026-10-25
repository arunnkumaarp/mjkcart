import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import type { Courier, StaffOrder } from '@mjkcart/api';

import { Api } from '../../core/api';
import { money } from '../../shared/money';
import { DeskCounts, type OrderCounts } from './desk-counts';

type Status = keyof OrderCounts;
/** Every saved order has its number; the schema only marks it optional because it is filled in on save. */
type Order = StaffOrder & { number: string };

/** The steps an order goes through, in the words the shop uses, in the order the team works through them. */
const VIEWS: { key: Status | ''; label: string; empty: string }[] = [
  { key: 'confirmed', label: 'To pack', empty: 'Nothing to pack. New orders show up here.' },
  { key: 'packed', label: 'To ship', empty: 'Nothing packed and waiting for the courier.' },
  { key: 'payment_pending', label: 'Awaiting payment', empty: 'No orders waiting for a UPI payment.' },
  { key: 'shipped', label: 'On the way', empty: 'No parcels with the courier right now.' },
  { key: 'delivered', label: 'Delivered', empty: 'No delivered orders yet.' },
  { key: 'cancelled', label: 'Cancelled', empty: 'No cancelled orders.' },
  { key: 'returned', label: 'Returned', empty: 'No returned orders.' },
  { key: '', label: 'All', empty: 'No orders yet. They show up here as soon as a buyer orders.' },
];
const LABEL = Object.fromEntries(VIEWS.map((v) => [v.key, v.label])) as Record<string, string>;
const PAGE = 20;

/** Orders for the shop team: what to pack and ship next, who it goes to, and one button for each next step. */
@Component({
  selector: 'mjk-orders-desk',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-desk.html',
  styleUrls: ['./admin.css', './orders-desk.css'],
})
export class OrdersDesk {
  private api = inject(Api).client;
  readonly counts = inject(DeskCounts);
  readonly money = money;
  readonly views = VIEWS;
  readonly label = LABEL;
  /** Asks the desk to open the Payments tab. */
  readonly openPayments = output<void>();

  readonly view = signal<Status | ''>('confirmed');
  readonly q = signal('');
  readonly orders = signal<Order[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private page = 1;

  readonly couriers = signal<Courier[]>([]);
  /** The order being worked on: shipping details open, or asking "really?" before a step that can't be undone. */
  readonly shipping = signal<string | null>(null);
  readonly confirming = signal<{ number: string; status: 'cancelled' | 'returned' } | null>(null);
  readonly courier = signal('');
  readonly tracking = signal('');
  readonly working = signal<string | null>(null);
  readonly note = signal('');
  readonly error = signal('');

  readonly emptyText = computed(() =>
    this.q().trim() ? 'No order matches that search.' : (VIEWS.find((v) => v.key === this.view())?.empty ?? ''),
  );

  constructor() {
    void this.load(true);
    void this.counts.refresh();
    void this.api.GET('/api/v1/staff/couriers/').then(({ data }) => this.couriers.set(data ?? []));
  }

  count(key: Status | '') {
    const c = this.counts.orders();
    if (!c) return null;
    return key ? c[key] : Object.values(c).reduce((n, x) => n + x, 0);
  }

  pick(key: Status | '') {
    this.view.set(key);
    this.note.set('');
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
    const q = this.q().trim();
    // A search looks through every order, whichever tab is open.
    const status = q ? undefined : this.view() || undefined;
    try {
      const { data } = await this.api.GET('/api/v1/staff/orders/', {
        params: { query: { page: this.page, page_size: PAGE, ...(status ? { status } : {}), ...(q ? { search: q } : {}) } },
      });
      if (data) {
        this.orders.update((list) => (fresh ? (data.results as Order[]) : [...list, ...(data.results as Order[])]));
        this.total.set(data.count);
      } else {
        this.failed.set(true);
      }
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  startShip(o: Order) {
    this.shipping.set(o.number);
    this.confirming.set(null);
    // Left empty rather than guessed, so a parcel is never booked under the wrong courier.
    this.courier.set(o.courier_name ?? '');
    this.tracking.set(o.tracking_number ?? '');
    this.error.set('');
  }

  ship(event: Event, o: Order) {
    event.preventDefault();
    const courier_name = this.courier().trim();
    const tracking_number = this.tracking().trim();
    if (!courier_name) return this.error.set('Type the courier’s name, like India Post or DTDC.');
    if (!tracking_number) return this.error.set('Type the tracking number from the courier’s receipt.');
    void this.move(o, 'shipped', { courier_name, tracking_number });
  }

  async move(o: Order, status: Status, extra: { courier_name?: string; tracking_number?: string } = {}) {
    this.working.set(o.number);
    this.error.set('');
    this.note.set('');
    try {
      const { data, error } = await this.api.POST('/api/v1/staff/orders/{number}/status/', {
        params: { path: { number: o.number } },
        body: { status, note: '', courier_name: '', tracking_number: '', ...extra },
      });
      if (data) {
        this.shipping.set(null);
        this.confirming.set(null);
        const stays = !this.view() || this.q().trim() || data.status === this.view();
        this.orders.update((list) => (stays ? list.map((x) => (x.number === o.number ? (data as Order) : x)) : list.filter((x) => x.number !== o.number)));
        if (!stays) this.total.update((n) => n - 1);
        this.note.set(this.done(data as Order));
        void this.counts.refresh();
      } else {
        this.error.set((error as { detail?: string } | undefined)?.detail ?? 'That didn’t save. Please try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.working.set(null);
  }

  confirm(o: Order, status: 'cancelled' | 'returned') {
    this.shipping.set(null);
    this.error.set('');
    this.confirming.set({ number: o.number, status });
  }

  /** Opens the packing slip and address label in a new tab, ready to print. */
  async print(o: Order) {
    // Open the tab now, while the click still counts, so the browser doesn't block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const { data } = await this.api.GET('/api/v1/staff/orders/slips/', {
        params: { query: { numbers: o.number } },
        parseAs: 'text',
      });
      if (!tab) return this.error.set('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
      if (!data) {
        tab.close();
        return this.error.set('We couldn’t make the packing slip. Please try again.');
      }
      tab.document.open();
      tab.document.write(data);
      tab.document.close();
    } catch {
      tab?.close();
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
  }

  whatsapp(phone: string) {
    const digits = phone.replace(/\D/g, '');
    return `https://wa.me/${digits.length === 10 ? '91' + digits : digits}`;
  }

  items(o: Order) {
    return o.items.reduce((n, i) => n + i.quantity, 0);
  }

  private done(o: Order) {
    switch (o.status) {
      case 'packed': return `${o.number} is packed. It’s waiting under “To ship”.`;
      case 'shipped': return `${o.number} is shipped with ${o.courier_name}. The buyer is told.`;
      case 'delivered': return `${o.number} is delivered.`;
      case 'cancelled': return `${o.number} is cancelled and its stock is back on the shelf.`;
      case 'returned': return `${o.number} is marked returned. Check the parcel before putting items back in stock.`;
      default: return `${o.number} is updated.`;
    }
  }
}
