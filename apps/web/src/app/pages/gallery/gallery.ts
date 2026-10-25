import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Category, Product, Variant } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Cart } from '../../core/cart';
import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

/**
 * Where buyers land after logging in: the shop's shelves as tabs and the products on them.
 * What the shop sells (electronics, jewellery, groceries) comes from its shelves and settings, not from here.
 */
@Component({
  selector: 'mjk-gallery',
  imports: [TopBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
})
export class Gallery {
  private api = inject(Api).client;
  readonly cart = inject(Cart);
  readonly shop = inject(Store).shop;
  readonly money = money;
  /** The shop team sees this page as a preview: no cart, hidden products marked. */
  readonly staff = inject(Auth).isStaff;

  /** The ?shelf= slug in the address; empty shows every shelf. */
  readonly shelf = input<string>('');

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  /** What the buyer typed in the search box, and the order they picked. */
  readonly q = signal('');
  readonly sort = signal<'' | 'low' | 'high'>('');
  /** Per product: what happened when its button was pressed. */
  readonly notes = signal<Record<number, string>>({});

  /** Shelves that have something on them, in the shop's order. */
  readonly shelves = computed(() => {
    const used = new Set(this.products().map((p) => p.category));
    return this.categories().filter((c) => used.has(c.id));
  });
  readonly current = computed(() => this.shelves().find((c) => c.slug === this.shelf()) ?? null);
  readonly shown = computed(() => {
    const shelf = this.current();
    const q = this.q().trim().toLowerCase();
    let list = shelf ? this.products().filter((p) => p.category === shelf.id) : this.products();
    if (q) list = list.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q));
    const price = (p: Product) => Number(this.pick(p)?.price ?? p.price_from ?? 0);
    if (this.sort()) list = [...list].sort((a, b) => (this.sort() === 'low' ? price(a) - price(b) : price(b) - price(a)));
    // In the team's preview, what buyers see comes first and hidden products follow.
    return this.staff() ? [...list].sort((a, b) => +this.hiddenFromBuyers(a) - +this.hiddenFromBuyers(b)) : list;
  });

  constructor() {
    void this.load();
    if (!this.staff()) void this.cart.load();
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [products, categories] = await Promise.all([
        this.api.GET('/api/v1/products/', { params: { query: { page_size: 100 } } }),
        this.api.GET('/api/v1/categories/'),
      ]);
      this.products.set(products.data?.results ?? []);
      this.categories.set(categories.data ?? []);
      this.failed.set(!products.data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  /** Only the shop team ever sees these: products switched off, or on a hidden shelf. */
  hiddenFromBuyers(product: Product) {
    return !product.is_active || this.categories().find((c) => c.id === product.category)?.is_active === false;
  }

  stock(product: Product) {
    return product.variants.reduce((n, v) => n + (v.is_active ? (v.stock ?? 0) : 0), 0);
  }

  /** The option a buyer gets from the gallery: the cheapest one in stock. */
  pick(product: Product): Variant | undefined {
    return product.variants.find((v) => v.is_active && (v.stock ?? 0) > 0);
  }

  off(variant: Variant) {
    const price = Number(variant.price);
    const mrp = Number(variant.mrp);
    return mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  }

  inCart(variant: Variant) {
    return this.cart.items().find((i) => i.variant === variant.id)?.quantity ?? 0;
  }

  async add(product: Product) {
    const variant = this.pick(product);
    if (!variant) return;
    const error = await this.cart.add(variant.id);
    this.notes.update((n) => ({ ...n, [product.id]: error || 'Added to your cart.' }));
  }
}
