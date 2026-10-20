import { Injectable, computed, inject, signal } from '@angular/core';
import type { Category, Product, Shop } from '@mjkcart/api';

import { Api } from './api';

/** Shop settings and the catalog, loaded once and shared by every page. */
@Injectable({ providedIn: 'root' })
export class Store {
  private api = inject(Api).client;
  readonly shop = signal<Shop | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loaded = signal(false);
  readonly failed = signal(false);

  readonly categoriesWithProducts = computed(() =>
    this.categories()
      .map((category) => ({ category, products: this.products().filter((p) => p.category === category.id) }))
      .filter((group) => group.products.length),
  );

  private started = false;

  async load() {
    if (this.started) return;
    this.started = true;
    try {
      const [shop, categories, products] = await Promise.all([
        this.api.GET('/api/v1/shop/'),
        this.api.GET('/api/v1/categories/'),
        this.api.GET('/api/v1/products/', { params: { query: { page_size: 100 } } }),
      ]);
      this.shop.set(shop.data ?? null);
      this.categories.set(categories.data ?? []);
      this.products.set(products.data?.results ?? []);
      this.failed.set(!shop.data);
    } catch {
      this.failed.set(true);
    }
    this.loaded.set(true);
  }

  categoryName(id: number | null | undefined) {
    return this.categories().find((c) => c.id === id)?.name ?? '';
  }
}
