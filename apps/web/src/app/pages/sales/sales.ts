import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReportDay, ReportSummary, TopProduct, components } from '@mjkcart/api';

import { Api } from '../../core/api';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';
import { Buyers } from './buyers';
import { ProductSalesTable } from './product-sales';
import { SalesChart } from './sales-chart';

type CategorySales = components['schemas']['CategorySales'];
type ProductSales = components['schemas']['ProductSales'];

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

/** The admin's sales page: totals for a period, revenue over time, sales per shelf, best sellers, every product and buyers. */
@Component({
  selector: 'mjk-sales',
  imports: [TopBar, RouterLink, SalesChart, Buyers, ProductSalesTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales.html',
  styleUrl: './sales.css',
})
export class Sales {
  private api = inject(Api).client;
  readonly money = money;
  readonly periods = PERIODS;

  readonly days = signal(30);
  readonly summary = signal<ReportSummary | null>(null);
  readonly daily = signal<ReportDay[]>([]);
  readonly categories = signal<CategorySales[]>([]);
  readonly top = signal<TopProduct[]>([]);
  readonly products = signal<ProductSales[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly categoryTotal = computed(() => this.categories().reduce((n, c) => n + Number(c.revenue), 0));

  constructor() {
    void this.load();
  }

  pick(days: number) {
    this.days.set(days);
    void this.load();
  }

  share(revenue: string) {
    const total = this.categoryTotal();
    return total ? Math.round((Number(revenue) / total) * 100) : 0;
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - (this.days() - 1));
    const query = { date_from: isoDay(from), date_to: isoDay(to) };
    try {
      const [summary, daily, categories, top, products] = await Promise.all([
        this.api.GET('/api/v1/staff/reports/summary/', { params: { query } }),
        this.api.GET('/api/v1/staff/reports/daily/', { params: { query } }),
        this.api.GET('/api/v1/staff/reports/categories/', { params: { query } }),
        this.api.GET('/api/v1/staff/reports/top-products/', { params: { query: { ...query, limit: 10 } } }),
        this.api.GET('/api/v1/staff/reports/products/', { params: { query } }),
      ]);
      this.summary.set(summary.data ?? null);
      this.daily.set(daily.data ?? []);
      this.categories.set(categories.data ?? []);
      this.top.set(top.data ?? []);
      this.products.set(products.data ?? []);
      this.failed.set(!summary.data);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }
}

/** YYYY-MM-DD in the viewer's own calendar, which is the shop's (India). */
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
