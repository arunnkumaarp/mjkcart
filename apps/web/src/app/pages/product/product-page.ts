import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Category, Product, Variant } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Cart } from '../../core/cart';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

/** Under this many left, buyers are told stock is running low. */
const FEW = 5;

/** One product: every photo, the full description, its options and how many to add. */
@Component({
  selector: 'mjk-product-page',
  imports: [TopBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-page.html',
  styleUrl: './product-page.css',
})
export class ProductPage {
  private api = inject(Api).client;
  readonly cart = inject(Cart);
  readonly staff = inject(Auth).isStaff;
  readonly money = money;

  /** The product's slug from the address, e.g. /shop/wireless-earbuds. */
  readonly slug = input.required<string>();

  readonly product = signal<Product | null>(null);
  readonly shelf = signal<Category | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly photo = signal(0);
  readonly chosen = signal<number | null>(null);
  readonly quantity = signal(1);
  readonly note = signal('');
  readonly error = signal('');

  /** Options a buyer can pick; removed ones are left out. */
  readonly options = computed(() => this.product()?.variants.filter((v) => v.is_active) ?? []);
  readonly variant = computed(() => this.options().find((v) => v.id === this.chosen()) ?? null);
  readonly left = computed(() => this.variant()?.stock ?? 0);
  readonly inCart = computed(() => this.cart.items().find((i) => i.variant === this.chosen())?.quantity ?? 0);

  constructor() {
    effect(() => void this.load(this.slug()));
    if (!this.staff()) void this.cart.load();
  }

  async load(slug = this.slug()) {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { data } = await this.api.GET('/api/v1/products/{slug}/', { params: { path: { slug } } });
      this.product.set(data ?? null);
      this.failed.set(!data);
      if (data) {
        this.photo.set(0);
        this.quantity.set(1);
        // Start on the first option in stock, so Add to cart works straight away.
        const first = data.variants.find((v) => v.is_active && (v.stock ?? 0) > 0) ?? data.variants.find((v) => v.is_active);
        this.chosen.set(first?.id ?? null);
        const shelves = await this.api.GET('/api/v1/categories/');
        this.shelf.set(shelves.data?.find((c) => c.id === data.category) ?? null);
      }
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  choose(v: Variant) {
    this.chosen.set(v.id);
    this.quantity.set(1);
    this.note.set('');
    this.error.set('');
  }

  step(by: number) {
    this.quantity.update((q) => Math.min(Math.max(1, q + by), Math.max(1, this.left())));
  }

  off(v: Variant) {
    const price = Number(v.price);
    const mrp = Number(v.mrp);
    return mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  }

  few(v: Variant | null) {
    return !!v && (v.stock ?? 0) > 0 && (v.stock ?? 0) <= FEW;
  }

  async add() {
    const v = this.variant();
    if (!v) return;
    this.note.set('');
    this.error.set('');
    const error = await this.cart.add(v.id, this.quantity());
    if (error) return this.error.set(error);
    this.note.set(`Added ${this.quantity()} to your cart.`);
    this.quantity.set(1);
  }
}
