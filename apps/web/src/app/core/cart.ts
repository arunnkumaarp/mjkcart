import { Injectable, computed, inject, signal } from '@angular/core';
import type { Cart as CartData } from '@mjkcart/api';

import { Api } from './api';

/** The logged-in buyer's cart, kept on the server so it follows them between devices. */
@Injectable({ providedIn: 'root' })
export class Cart {
  private api = inject(Api).client;
  readonly data = signal<CartData | null>(null);
  readonly items = computed(() => this.data()?.items ?? []);
  readonly count = computed(() => this.data()?.item_count ?? 0);
  readonly loading = signal(false);
  readonly failed = signal(false);
  /** The variant being added or the cart line being changed, so its button can say so. */
  readonly working = signal<number | null>(null);

  async load() {
    this.loading.set(true);
    try {
      const { data } = await this.api.GET('/api/v1/cart/');
      this.data.set(data ?? null);
      this.failed.set(!data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  /** Returns an error message to show, or '' when it worked. */
  add(variant: number, quantity = 1) {
    return this.change(variant, () => this.api.POST('/api/v1/cart/items/', { body: { variant, quantity } }));
  }

  setQuantity(item: number, quantity: number) {
    return this.change(item, () =>
      this.api.PATCH('/api/v1/cart/items/{id}/', { params: { path: { id: item } }, body: { quantity } }),
    );
  }

  remove(item: number) {
    return this.change(item, () => this.api.DELETE('/api/v1/cart/items/{id}/', { params: { path: { id: item } } }));
  }

  reset() {
    this.data.set(null);
  }

  private async change(key: number, call: () => Promise<{ data?: CartData; error?: unknown }>) {
    this.working.set(key);
    try {
      const { data, error } = await call();
      if (data) this.data.set(data);
      return data ? '' : quantityError(error);
    } catch {
      return 'We can’t reach the shop right now. Please try again.';
    } finally {
      this.working.set(null);
    }
  }
}

function quantityError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { quantity?: unknown; detail?: unknown };
    if (Array.isArray(e.quantity) && typeof e.quantity[0] === 'string') return e.quantity[0];
    if (typeof e.detail === 'string') return e.detail;
  }
  return 'That didn’t work. Please try again.';
}
