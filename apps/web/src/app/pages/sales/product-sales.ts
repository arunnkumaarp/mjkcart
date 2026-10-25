import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { components } from '@mjkcart/api';

import { money } from '../../shared/money';

type ProductSales = components['schemas']['ProductSales'];

/** Every product with its sales in the period, unsold ones included, filterable by category and name. */
@Component({
  selector: 'mjk-product-sales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="products-title">
      <div class="head">
        <h2 id="products-title">Sales by product</h2>
        <p class="hint num">{{ soldCount() }} of {{ rows().length }} products sold in this period</p>
      </div>
      <div class="tools">
        <div class="periods" role="group" aria-label="Category">
          @for (c of shelves(); track c) {
            <button type="button" class="chip" [class.is-on]="shelf() === c" [attr.aria-pressed]="shelf() === c" (click)="shelf.set(c)">
              {{ c }}
            </button>
          }
        </div>
        <label for="product-q" class="visually-hidden">Search products</label>
        <input id="product-q" type="search" placeholder="Search products" [value]="q()" (input)="q.set($any($event.target).value)" />
      </div>

      @if (!rows().length) {
        <p class="hint">No products yet. Add them on the admin desk.</p>
      } @else if (!shown().length) {
        <p class="hint">No product matches that.</p>
      } @else {
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" class="r">Sold</th>
                <th scope="col" class="r">Orders</th>
                <th scope="col" class="r">Revenue</th>
                <th scope="col" class="r">In stock</th>
              </tr>
            </thead>
            <tbody>
              @for (p of shown(); track p.id) {
                <tr [class.is-quiet]="!p.quantity">
                  <td>
                    <strong>{{ p.name }}</strong>
                    @if (!p.shown) {
                      <br /><span class="tag">Hidden from buyers</span>
                    }
                  </td>
                  <td>{{ p.category }}</td>
                  <td class="num r">{{ p.quantity }}</td>
                  <td class="num r">{{ p.orders }}</td>
                  <td class="num r"><strong>{{ money(p.revenue) }}</strong></td>
                  <td class="num r">{{ p.stock ? p.stock : 'Out of stock' }}</td>
                </tr>
              }
            </tbody>
            @if (shown().length > 1) {
              <tfoot>
                <tr>
                  <th scope="row" colspan="2">Total</th>
                  <td class="num r">{{ total().quantity }}</td>
                  <td></td>
                  <td class="num r"><strong>{{ money(total().revenue) }}</strong></td>
                  <td class="num r">{{ total().stock }}</td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
        <p class="hint">Item prices before coupons and delivery. Products that haven’t sold are greyed and listed last.</p>
      }
    </section>
  `,
  styleUrl: './sales.css',
  styles: `
    .tools { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; }
    .tools input {
      flex: 0 1 260px; min-width: 0; min-height: 44px; padding: 8px 10px; border: 2px solid var(--paper-ink); border-radius: 0;
      background: var(--paper); font-size: var(--step-body);
    }
    .is-quiet td { color: var(--paper-muted); }
    tfoot th, tfoot td { padding: 10px 8px; border-top: 2px solid var(--paper-ink); border-bottom: 0; text-align: left; color: var(--paper-ink); }
    tfoot td.r { text-align: right; }
    .tag { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 1px solid currentColor; font-size: 12px; font-weight: 600; }
  `,
})
export class ProductSalesTable {
  readonly rows = input.required<ProductSales[]>();
  readonly money = money;
  readonly shelf = signal('All');
  readonly q = signal('');

  readonly shelves = computed(() => ['All', ...new Set(this.rows().map((r) => r.category))]);
  readonly soldCount = computed(() => this.rows().filter((r) => r.quantity).length);
  readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const shelf = this.shelves().includes(this.shelf()) ? this.shelf() : 'All';
    return this.rows().filter((r) => (shelf === 'All' || r.category === shelf) && (!q || r.name.toLowerCase().includes(q)));
  });
  readonly total = computed(() =>
    this.shown().reduce(
      (t, r) => ({ quantity: t.quantity + r.quantity, revenue: t.revenue + Number(r.revenue), stock: t.stock + r.stock }),
      { quantity: 0, revenue: 0, stock: 0 },
    ),
  );
}
