import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Variant } from '@mjkcart/api';

import { Cart } from '../../core/cart';
import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { Plate } from '../../shared/plate';
import { Reveal } from '../../shared/reveal';

/** One product worth a look: the one with the most options, so the tabs have something to switch. */
@Component({
  selector: 'mjk-showcase',
  imports: [RouterLink, Plate, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './showcase.html',
  styleUrl: './showcase.css',
})
export class Showcase {
  private store = inject(Store);
  private cart = inject(Cart);
  readonly money = money;

  readonly product = computed(() =>
    [...this.store.products()].sort((a, b) => b.variants.length - a.variants.length)[0] ?? null,
  );
  readonly category = computed(() => this.store.categoryName(this.product()?.category));
  private chosenId = signal<number | null>(null);
  readonly variant = computed<Variant | null>(() => {
    const variants: Variant[] = this.product()?.variants ?? [];
    return variants.find((v) => v.id === this.chosenId()) ?? variants.find((v) => (v.stock ?? 0) > 0) ?? variants[0] ?? null;
  });
  readonly soldOut = computed(() => (this.variant()?.stock ?? 0) === 0);
  readonly stockNote = computed(() => {
    const stock = this.variant()?.stock ?? 0;
    return stock === 0 ? 'Out of stock' : stock <= 5 ? `Only ${stock} left` : 'In stock';
  });
  readonly added = signal('');

  choose(id: number) {
    this.chosenId.set(id);
    this.added.set('');
  }

  add() {
    const v = this.variant();
    if (!v || this.soldOut()) return;
    this.cart.add(v.id);
    this.added.set(`Added. ${this.cart.count()} in your cart.`);
  }
}
