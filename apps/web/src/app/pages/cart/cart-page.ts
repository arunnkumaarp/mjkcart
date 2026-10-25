import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CartItem } from '@mjkcart/api';

import { Cart } from '../../core/cart';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

/** The buyer's cart: change how many, take things out, see the total. */
@Component({
  selector: 'mjk-cart-page',
  imports: [TopBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.css',
})
export class CartPage {
  readonly cart = inject(Cart);
  readonly money = money;
  readonly error = signal('');

  constructor() {
    void this.cart.load();
  }

  lineTotal(item: CartItem) {
    return Number(item.price) * item.quantity;
  }

  async step(item: CartItem, by: number) {
    const quantity = item.quantity + by;
    const error = quantity < 1 ? await this.cart.remove(item.id) : await this.cart.setQuantity(item.id, quantity);
    this.error.set(error);
  }

  async remove(item: CartItem) {
    this.error.set(await this.cart.remove(item.id));
  }
}
