import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { ReportDay } from '@mjkcart/api';

import { money } from '../../shared/money';

interface Bar {
  start: string;
  end: string;
  revenue: number;
  orders: number;
}

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 24, left: 56 };

/**
 * Revenue over the period as one series of ink bars, with a hover/focus tooltip and a table view.
 * Long periods are summed by week so each bar stays wide enough to read and to point at.
 */
@Component({
  selector: 'mjk-sales-chart',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      <figcaption class="visually-hidden">Revenue per {{ weekly() ? 'week' : 'day' }}</figcaption>
      <div class="plot" (mouseleave)="hover.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="summary()">
          @for (t of ticks(); track t.value) {
            <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="axis" [attr.x]="PAD.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ short(t.value) }}</text>
          }
          @for (b of bars(); track b.start; let i = $index) {
            <rect
              class="bar"
              [class.is-on]="hover() === i"
              [attr.x]="x(i) + gap() / 2"
              [attr.y]="y(b.revenue)"
              [attr.width]="barWidth()"
              [attr.height]="H - PAD.bottom - y(b.revenue)"
            />
            <!-- A full-height hit area, wider than the bar, so thin bars are easy to point at. -->
            <rect
              class="hit"
              tabindex="0"
              [attr.x]="x(i)"
              [attr.y]="PAD.top"
              [attr.width]="step()"
              [attr.height]="H - PAD.top - PAD.bottom"
              [attr.aria-label]="label(b)"
              (mouseenter)="hover.set(i)"
              (focus)="hover.set(i)"
              (blur)="hover.set(null)"
            />
          }
          <line class="base" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="H - PAD.bottom" [attr.y2]="H - PAD.bottom" />
          @for (l of xLabels(); track l.i) {
            <text class="axis" [attr.x]="x(l.i) + step() / 2" [attr.y]="H - 6" text-anchor="middle">{{ l.text }}</text>
          }
        </svg>
        @if (hover() !== null) {
          @let b = bars()[hover()!];
          <div class="tip" [style.left.%]="tipLeft(hover()!)" role="status">
            <strong>{{ b.start | date: 'd MMM' }}{{ weekly() ? ' – ' + (b.end | date: 'd MMM') : '' }}</strong>
            <span class="num">{{ money(b.revenue) }}</span>
            <span class="num">{{ b.orders }} {{ b.orders === 1 ? 'order' : 'orders' }}</span>
          </div>
        }
      </div>
      <details>
        <summary>Show as a table</summary>
        <table>
          <thead><tr><th scope="col">{{ weekly() ? 'Week from' : 'Day' }}</th><th scope="col">Orders</th><th scope="col">Revenue</th></tr></thead>
          <tbody>
            @for (b of bars(); track b.start) {
              <tr><td>{{ b.start | date: 'd MMM y' }}</td><td class="num">{{ b.orders }}</td><td class="num">{{ money(b.revenue) }}</td></tr>
            }
          </tbody>
        </table>
      </details>
    </figure>
  `,
  styles: `
    .chart { margin: 0; display: grid; gap: 8px; }
    .plot { position: relative; }
    svg { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: var(--paper-step); stroke-width: 1; }
    .base { stroke: var(--paper-ink); stroke-width: 1; }
    .axis { fill: var(--paper-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .bar { fill: var(--ink); }
    .bar.is-on { fill: var(--bg); }
    .hit { fill: transparent; cursor: default; outline: none; }
    .hit:focus-visible { stroke: var(--ink); stroke-width: 2; }
    .tip {
      position: absolute; top: 0; transform: translate(-50%, -100%); pointer-events: none; white-space: nowrap;
      display: grid; gap: 2px; padding: 8px 10px; background: var(--ink); color: var(--paper); font-size: var(--step-small);
    }
    details { font-size: var(--step-small); }
    summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--paper-step); }
    td.num, th:not(:first-child) { text-align: right; }
  `,
})
export class SalesChart {
  readonly days = input.required<ReportDay[]>();
  readonly money = money;
  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;
  readonly hover = signal<number | null>(null);

  readonly weekly = computed(() => this.days().length > 92);
  readonly bars = computed<Bar[]>(() => {
    const days = this.days();
    const size = this.weekly() ? 7 : 1;
    const out: Bar[] = [];
    for (let i = 0; i < days.length; i += size) {
      const chunk = days.slice(i, i + size);
      out.push({
        start: chunk[0].date,
        end: chunk[chunk.length - 1].date,
        revenue: chunk.reduce((n, d) => n + Number(d.revenue), 0),
        orders: chunk.reduce((n, d) => n + d.orders, 0),
      });
    }
    return out;
  });
  readonly max = computed(() => niceMax(Math.max(0, ...this.bars().map((b) => b.revenue))));
  readonly step = computed(() => (W - PAD.left - PAD.right) / Math.max(1, this.bars().length));
  readonly gap = computed(() => Math.min(2, this.step() * 0.3));
  readonly barWidth = computed(() => Math.max(1, this.step() - this.gap()));
  readonly ticks = computed(() => [0, 0.5, 1].map((f) => ({ value: this.max() * f, y: this.y(this.max() * f) })));
  /** About six date labels along the bottom, whatever the period. */
  readonly xLabels = computed(() => {
    const bars = this.bars();
    const every = Math.max(1, Math.ceil(bars.length / 6));
    const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
    return bars.map((b, i) => ({ i, text: fmt.format(new Date(b.start)) })).filter((l) => l.i % every === 0);
  });
  readonly summary = computed(() => {
    const total = this.bars().reduce((n, b) => n + b.revenue, 0);
    const best = this.bars().reduce<Bar | null>((a, b) => (!a || b.revenue > a.revenue ? b : a), null);
    return `Revenue per ${this.weekly() ? 'week' : 'day'}, ${money(total)} in all` +
      (best && best.revenue ? `; highest ${money(best.revenue)} from ${best.start}` : '');
  });

  x(i: number) {
    return PAD.left + i * this.step();
  }

  y(value: number) {
    const max = this.max() || 1;
    return PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);
  }

  /** Tooltip centre as a % of the width, kept far enough in that the tooltip stays inside the panel. */
  tipLeft(i: number) {
    return Math.min(90, Math.max(10, ((this.x(i) + this.step() / 2) / W) * 100));
  }

  short(value: number) {
    if (value >= 100000) return `₹${+(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${+(value / 1000).toFixed(1)}k`;
    return `₹${Math.round(value)}`;
  }

  label(b: Bar) {
    return `${b.start}${this.weekly() ? ' week' : ''}: ${money(b.revenue)}, ${b.orders} orders`;
  }
}

/** A round axis top just above the biggest bar: 1, 2 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((m) => m * p >= value) ?? 10) * p;
}
