import { Injectable, computed, inject, signal } from '@angular/core';
import type { Category, Product } from '@mjkcart/api';

import { Api } from '../../core/api';

export interface NewProduct {
  name: string;
  description: string;
  category: number | null;
  price: string;
  mrp: string;
  stock: string;
  show: boolean;
}

const OFFLINE = 'We can’t reach the shop right now. Please try again.';

/** The first message DRF sent back, e.g. {"mrp": ["MRP can't be less than the price."]}. */
function fieldError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const value of Object.values(error)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}

/**
 * Everything the admin desk edits in the catalog: shelves (categories) and the products on them.
 * Nothing here knows what the shop sells; electronics, jewellery or groceries are just shelf names.
 */
@Injectable()
export class CatalogAdmin {
  private api = inject(Api).client;

  readonly shelves = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  /** The product or shelf whose switch is being flipped, as 'product:12' or 'shelf:3'. */
  readonly toggling = signal<string | null>(null);

  readonly shownShelves = computed(() => this.shelves().filter((s) => s.is_active));
  readonly countOn = computed(() => {
    const counts = new Map<number, number>();
    for (const p of this.products()) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return counts;
  });

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [products, categories] = await Promise.all([
        this.api.GET('/api/v1/products/', { params: { query: { page_size: 100 } } }),
        this.api.GET('/api/v1/categories/'),
      ]);
      this.products.set(products.data?.results ?? []);
      this.shelves.set(categories.data ?? []);
      this.failed.set(!products.data || !categories.data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  shelfName(id: number | null | undefined) {
    return this.shelves().find((s) => s.id === id)?.name ?? 'No shelf';
  }

  /** Returns an error message, or '' when it worked. */
  async toggleProduct(product: Product) {
    this.toggling.set(`product:${product.id}`);
    try {
      const { data } = await this.api.PATCH('/api/v1/products/{slug}/', {
        params: { path: { slug: product.slug } },
        body: { is_active: !product.is_active },
      });
      if (!data) return `We couldn’t change ${product.name}. Please try again.`;
      this.products.update((list) => list.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      return '';
    } catch {
      return OFFLINE;
    } finally {
      this.toggling.set(null);
    }
  }

  /** Saves new price, MRP and stock on a product's options, then refreshes that product. '' when it worked. */
  async updateVariants(product: Product, changes: { id: number; price: string; mrp: string | null; stock: number }[]) {
    try {
      for (const { id, ...body } of changes) {
        const { data, error } = await this.api.PATCH('/api/v1/variants/{id}/', { params: { path: { id } }, body });
        if (!data) return fieldError(error) ?? `We couldn’t save ${product.name}. Please try again.`;
      }
      const { data } = await this.api.GET('/api/v1/products/{slug}/', { params: { path: { slug: product.slug } } });
      if (data) this.products.update((list) => list.map((p) => (p.id === data.id ? data : p)));
      return '';
    } catch {
      return OFFLINE;
    }
  }

  /**
   * Saves a product's name, description and shelf, and swaps its photo when a new one is given.
   * Price and stock go through updateVariants. Returns an error message, or '' when it worked.
   */
  async updateProduct(product: Product, fields: { name: string; description: string; category: number | null }, photo: File | null) {
    try {
      const changed = fields.name !== product.name || fields.description !== product.description || fields.category !== product.category;
      if (changed) {
        const { data, error } = await this.api.PATCH('/api/v1/products/{slug}/', { params: { path: { slug: product.slug } }, body: fields });
        if (!data) return fieldError(error) ?? `We couldn’t save ${product.name}. Please try again.`;
      }
      if (photo) {
        const image = await this.uploadPhoto(product.id, photo, fields.name);
        if (!image) return 'The details are saved, but the photo didn’t upload. Try a JPG or PNG.';
        // The new photo is in; the old ones go so buyers see only the new one.
        for (const old of product.images) {
          await this.api.DELETE('/api/v1/product-images/{id}/', { params: { path: { id: old.id } } });
        }
      }
      const { data } = await this.api.GET('/api/v1/products/{slug}/', { params: { path: { slug: product.slug } } });
      if (data) this.products.update((list) => list.map((p) => (p.id === product.id ? data : p)));
      return '';
    } catch {
      return OFFLINE;
    }
  }

  private async uploadPhoto(product: number, photo: File, alt: string) {
    const { data } = await this.api.POST('/api/v1/product-images/', {
      body: { product, image: '', alt },
      bodySerializer: () => {
        const form = new FormData();
        form.append('product', String(product));
        form.append('image', photo);
        form.append('alt', alt);
        return form;
      },
    });
    return data;
  }

  async toggleShelf(shelf: Category) {
    this.toggling.set(`shelf:${shelf.id}`);
    try {
      const { data } = await this.api.PATCH('/api/v1/categories/{slug}/', {
        params: { path: { slug: shelf.slug } },
        body: { is_active: !shelf.is_active },
      });
      if (!data) return `We couldn’t change the ${shelf.name} shelf. Please try again.`;
      this.shelves.update((list) => list.map((s) => (s.id === data.id ? data : s)));
      return '';
    } catch {
      return OFFLINE;
    } finally {
      this.toggling.set(null);
    }
  }

  async addShelf(name: string) {
    try {
      const { data } = await this.api.POST('/api/v1/categories/', {
        body: { name, sort_order: this.shelves().length },
      });
      if (!data) return 'We couldn’t add that shelf. Please try again.';
      // Read the list back rather than appending, so a page load still in flight can't drop or double it.
      const fresh = await this.api.GET('/api/v1/categories/');
      this.shelves.update((list) => fresh.data ?? (list.some((s) => s.id === data.id) ? list : [...list, data]));
      return '';
    } catch {
      return OFFLINE;
    }
  }

  /** Makes the product, its one buyable option and (if given) its photo. */
  async addProduct(f: NewProduct, photo: File | null) {
    try {
      const made = await this.api.POST('/api/v1/products/', {
        body: { name: f.name.trim(), description: f.description.trim(), category: f.category, is_active: f.show },
      });
      if (!made.data) return { error: 'We couldn’t add the product. Check the details and try again.' };
      const id = made.data.id;
      const variant = await this.api.POST('/api/v1/variants/', {
        body: { product: id, price: f.price, mrp: f.mrp || null, stock: Number(f.stock), sku: null },
      });
      if (!variant.data) {
        await this.load();
        return { error: 'The product is saved but its price didn’t. Check the price and MRP and try again.' };
      }
      let warning = '';
      if (photo && !(await this.uploadPhoto(id, photo, f.name.trim()))) {
        warning = 'The product is saved, but the photo didn’t upload. Try a JPG or PNG.';
      }
      await this.load();
      return { error: warning };
    } catch {
      return { error: OFFLINE };
    }
  }
}
