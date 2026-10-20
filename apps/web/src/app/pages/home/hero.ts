import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Cart } from '../../core/cart';
import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { postalZone } from '../../shared/pincode';

/** First screen: the name, the section folders, and the front folder holding the shipping label. */
@Component({
  selector: 'mjk-hero',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero {
  private store = inject(Store);
  readonly cart = inject(Cart);
  readonly shop = this.store.shop;

  readonly folders = [
    { name: 'Questions', href: '#questions', tone: 'paper', x: '68%' },
    { name: 'Our story', href: '#story', tone: 'surface', x: '40%' },
    { name: 'How it reaches you', href: '#journey', tone: 'ink', x: '8%' },
  ];

  readonly name = signal('');
  readonly pincode = signal('');
  readonly zone = computed(() => postalZone(this.pincode()));
  readonly pinTyped = computed(() => this.pincode().length > 0);

  readonly delivery = computed(() => {
    const s = this.shop();
    return s ? `Delivery ${money(s.shipping_flat)}, free on orders over ${money(s.free_shipping_above)}` : '';
  });
  readonly payment = computed(() => {
    const s = this.shop();
    if (!s) return '';
    return s.cod_enabled ? `Cash on delivery up to ${money(s.cod_max_order)}, or prepaid by UPI` : 'Prepaid by UPI';
  });

  onPincode(value: string) {
    this.pincode.set(value.replace(/\D/g, '').slice(0, 6));
  }
}
