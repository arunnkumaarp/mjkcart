import { Injectable, computed, signal } from '@angular/core';

import { storage } from './storage';

export interface CartLine {
  variant: number;
  quantity: number;
}

/** The cart kept on this device until the customer logs in; then it is sent with /cart/merge/. */
@Injectable({ providedIn: 'root' })
export class Cart {
  readonly lines = signal<CartLine[]>(storage.get<CartLine[]>('mjk.cart', []));
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));

  add(variant: number, quantity = 1) {
    const lines = [...this.lines()];
    const line = lines.find((l) => l.variant === variant);
    if (line) line.quantity += quantity;
    else lines.push({ variant, quantity });
    this.lines.set(lines);
    storage.set('mjk.cart', lines);
  }
}
