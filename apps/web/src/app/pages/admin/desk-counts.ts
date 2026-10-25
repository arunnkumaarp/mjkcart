import { Injectable, computed, inject, signal } from '@angular/core';
import type { components } from '@mjkcart/api';

import { Api } from '../../core/api';

export type OrderCounts = components['schemas']['OrderCounts'];

/** The numbers on the desk's tabs: orders waiting in each step, and payments waiting to be checked. */
@Injectable()
export class DeskCounts {
  private api = inject(Api).client;

  readonly orders = signal<OrderCounts | null>(null);
  readonly payments = signal(0);
  /** Orders the team has to act on: pack the confirmed ones, ship the packed ones. */
  readonly toDo = computed(() => (this.orders()?.confirmed ?? 0) + (this.orders()?.packed ?? 0));

  async refresh() {
    try {
      const [orders, payments] = await Promise.all([
        this.api.GET('/api/v1/staff/orders/counts/'),
        this.api.GET('/api/v1/staff/payments/', { params: { query: { status: 'submitted', page_size: 1 } } }),
      ]);
      if (orders.data) this.orders.set(orders.data);
      if (payments.data) this.payments.set(payments.data.count);
    } catch {
      /* the badges keep their last numbers */
    }
  }
}
