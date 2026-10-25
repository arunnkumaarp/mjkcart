import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Product } from '@mjkcart/api';

import { Auth } from '../../core/auth';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';
import { CatalogAdmin, type NewProduct } from './catalog-admin';
import { DeskCounts } from './desk-counts';
import { OrdersDesk } from './orders-desk';
import { PaymentSettings } from './payment-settings';
import { PaymentsReview } from './payments-review';
import { Shelves } from './shelves';
import { ShopDetails } from './shop-details';

interface Draft {
  price: string;
  mrp: string;
  stock: string;
}

interface Details {
  name: string;
  description: string;
  category: number | null;
}

type Tab = 'orders' | 'products' | 'shelves' | 'payments' | 'settings';

const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'products', label: 'Products' },
  { key: 'shelves', label: 'Shelves' },
  { key: 'payments', label: 'Payments' },
  { key: 'settings', label: 'Shop settings', adminOnly: true },
];

/** At or under this many in stock, a product is flagged so the shop can restock in time. */
const LOW_STOCK = 5;

const BLANK: NewProduct = { name: '', description: '', category: null, price: '', mrp: '', stock: '1', show: true };

/** The admin desk, one job per tab: orders, products, shelves, payments and the shop's own details. */
@Component({
  selector: 'mjk-admin',
  imports: [TopBar, RouterLink, OrdersDesk, ShopDetails, Shelves, PaymentSettings, PaymentsReview],
  providers: [CatalogAdmin, DeskCounts],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.html',
  styleUrls: ['./admin.css', './admin-rows.css'],
})
export class Admin {
  readonly auth = inject(Auth);
  readonly catalog = inject(CatalogAdmin);
  readonly counts = inject(DeskCounts);
  private router = inject(Router);
  readonly money = money;
  readonly lowStock = LOW_STOCK;

  /** ?tab= in the address, so a tab can be bookmarked and the back button works. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  readonly tabs = computed(() => TABS.filter((t) => !t.adminOnly || this.auth.user()?.role === 'admin'));
  readonly tab = computed<Tab>(() => this.tabs().find((t) => t.key === this.tabParam())?.key ?? 'orders');

  /** Which shelf's products the list shows (null is every shelf), and the typed search. */
  readonly filter = signal<number | null>(null);
  readonly query = signal('');
  readonly listed = computed(() => {
    const shelf = this.filter();
    const q = this.query().trim().toLowerCase();
    return this.catalog.products().filter((p) => (shelf === null || p.category === shelf) && (!q || p.name.toLowerCase().includes(q)));
  });
  readonly shownCount = computed(() => this.listed().filter((p) => this.visible(p)).length);
  readonly listError = signal('');
  readonly listNote = signal('');

  /** The product open for editing: its details, a new photo if picked, and price and stock per option. */
  readonly editing = signal<number | null>(null);
  readonly details = signal<Details>({ name: '', description: '', category: null });
  readonly editPhoto = signal<File | null>(null);
  readonly drafts = signal<Record<number, Draft>>({});
  readonly savingEdit = signal(false);
  readonly editError = signal('');

  readonly adding = signal(false);
  readonly form = signal<NewProduct>({ ...BLANK });
  readonly photo = signal<File | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly formNote = signal('');

  constructor() {
    void this.catalog.load();
    void this.counts.refresh();
  }

  badge(tab: Tab) {
    if (tab === 'orders') return this.counts.toDo();
    if (tab === 'payments') return this.counts.payments();
    return 0;
  }

  go(tab: Tab) {
    void this.router.navigate([], { queryParams: { tab: tab === 'orders' ? null : tab } });
  }

  /** Buyers see a product only when it and its shelf are both shown. */
  visible(product: Product) {
    return product.is_active && this.shelfShown(product);
  }

  shelfShown(product: Product) {
    return !product.category || this.catalog.shelves().find((s) => s.id === product.category)?.is_active !== false;
  }

  /** What buyers see, in words, next to the switch. */
  seen(product: Product) {
    if (!product.is_active) return 'Hidden';
    return this.shelfShown(product) ? 'Shown' : 'Hidden (shelf)';
  }

  stock(product: Product) {
    return product.variants.reduce((n, v) => n + (v.is_active ? (v.stock ?? 0) : 0), 0);
  }

  async toggle(product: Product) {
    this.listError.set(await this.catalog.toggleProduct(product));
  }

  /** Turns on the hidden shelf a product sits on, so buyers can see it. */
  async showShelf(product: Product) {
    const shelf = this.catalog.shelves().find((s) => s.id === product.category);
    if (!shelf) return;
    const error = await this.catalog.toggleShelf(shelf);
    this.listError.set(error);
    if (!error) this.listNote.set(`The ${shelf.name} shelf is shown. Buyers can see its shown products.`);
  }

  /** Opens the editor under one product, with its details and options copied into drafts. */
  edit(product: Product) {
    this.editing.set(product.id);
    this.editError.set('');
    this.listNote.set('');
    this.editPhoto.set(null);
    this.details.set({ name: product.name, description: product.description ?? '', category: product.category ?? null });
    this.drafts.set(
      Object.fromEntries(
        product.variants.map((v) => [
          v.id,
          { price: String(Number(v.price)), mrp: v.mrp ? String(Number(v.mrp)) : '', stock: String(v.stock ?? 0) },
        ]),
      ),
    );
  }

  cancelEdit() {
    this.editing.set(null);
    this.editError.set('');
  }

  setDetail<K extends keyof Details>(key: K, value: Details[K]) {
    this.details.update((d) => ({ ...d, [key]: value }));
    this.editError.set('');
  }

  setDraft(variant: number, key: keyof Draft, value: string) {
    this.drafts.update((d) => ({ ...d, [variant]: { ...d[variant], [key]: value } }));
    this.editError.set('');
  }

  async saveEdit(event: Event, product: Product) {
    event.preventDefault();
    if (this.savingEdit()) return;
    const details = { ...this.details(), name: this.details().name.trim(), description: this.details().description.trim() };
    if (!details.name) return this.editError.set('Give the product a name.');
    if (!details.category) return this.editError.set('Pick the shelf it goes on.');
    const drafts = this.drafts();
    for (const v of product.variants) {
      const d = drafts[v.id];
      const price = Number(d.price);
      const label = product.variants.length > 1 && v.label ? ` for ${v.label}` : '';
      if (!(price > 0)) return this.editError.set(`Enter a price above zero${label}.`);
      if (d.mrp && Number(d.mrp) < price) return this.editError.set(`MRP can’t be less than the price${label}.`);
      if (!/^\d+$/.test(d.stock)) return this.editError.set(`Stock is a whole number, like 10${label}.`);
    }
    // Only send the options that actually changed.
    const changes = product.variants
      .filter((v) => {
        const d = drafts[v.id];
        return Number(d.price) !== Number(v.price) || Number(d.mrp || 0) !== Number(v.mrp || 0) || Number(d.stock) !== v.stock;
      })
      .map((v) => ({ id: v.id, price: drafts[v.id].price, mrp: drafts[v.id].mrp || null, stock: Number(drafts[v.id].stock) }));

    this.savingEdit.set(true);
    this.editError.set('');
    const error =
      (changes.length ? await this.catalog.updateVariants(product, changes) : '') ||
      (await this.catalog.updateProduct(product, details, this.editPhoto()));
    this.savingEdit.set(false);
    if (error) return this.editError.set(error);
    this.editing.set(null);
    this.listNote.set(`${details.name} is saved.`);
  }

  onFilter(value: string) {
    this.filter.set(value ? Number(value) : null);
  }

  openAdd() {
    this.adding.set(true);
    this.formNote.set('');
    this.formError.set('');
    // Start on the shelf being looked at, which is usually where the new product goes.
    if (this.filter() !== null && !this.form().category) this.set('category', this.filter());
  }

  set<K extends keyof NewProduct>(key: K, value: NewProduct[K]) {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  onPhoto(input: HTMLInputElement) {
    this.photo.set(input.files?.[0] ?? null);
  }

  async add(event: Event, formEl: HTMLFormElement) {
    event.preventDefault();
    if (this.saving()) return;
    const f = this.form();
    const problem = this.check(f);
    if (problem) {
      this.formError.set(problem);
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.formNote.set('');
    const { error } = await this.catalog.addProduct(f, this.photo());
    // A photo warning still means the product was made.
    const made = !error || error.startsWith('The product is saved, but the photo');
    if (made) {
      const shelf = this.catalog.shelfName(f.category);
      this.formNote.set(`${f.name.trim()} is on the ${shelf} shelf${f.show ? ' and shown to buyers' : ', hidden from buyers'}. Add another, or close the form.`);
      // Keep the shelf picked, so several products can go on the same shelf in a row.
      this.form.set({ ...BLANK, category: f.category });
      this.photo.set(null);
      // Only the file picker keeps its own value; the other fields follow the form signal.
      const picker = formEl.querySelector<HTMLInputElement>('input[type=file]');
      if (picker) picker.value = '';
    }
    this.formError.set(error);
    this.saving.set(false);
  }

  private check(f: NewProduct) {
    if (!f.name.trim()) return 'Give the product a name.';
    if (!f.category) return 'Pick the shelf it goes on.';
    const price = Number(f.price);
    if (!(price > 0)) return 'Enter a price above zero.';
    if (f.mrp && Number(f.mrp) < price) return 'MRP can’t be less than the price.';
    if (!/^\d+$/.test(f.stock)) return 'Stock is a whole number, like 10.';
    return '';
  }
}
