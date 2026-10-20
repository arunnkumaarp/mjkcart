import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Product } from '@mjkcart/api';

import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { Plate } from '../../shared/plate';
import { Reveal } from '../../shared/reveal';

/** Every category as a bar that opens to its products; pointing at one shows it in a frame level with the row. */
@Component({
  selector: 'mjk-shop-index',
  imports: [RouterLink, Plate, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shop-index.html',
  styleUrl: './shop-index.css',
})
export class ShopIndex {
  readonly store = inject(Store);
  readonly money = money;
  private section = viewChild.required<ElementRef<HTMLElement>>('section');
  private frame = viewChild<ElementRef<HTMLElement>>('frame');

  private hovered = signal<Product | null>(null);
  readonly frameY = signal(0);
  readonly active = signal(false);
  /** The frame always holds something: the product pointed at, or the first one. */
  readonly shown = computed(() => this.hovered() ?? this.store.categoriesWithProducts()[0]?.products[0] ?? null);

  preview(product: Product, row: HTMLElement) {
    this.hovered.set(product);
    this.active.set(true);
    const frame = this.frame()?.nativeElement;
    if (!frame || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    // Level the frame's centre with the row, kept inside the section.
    const section = this.section().nativeElement.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const y = rowBox.top - section.top + rowBox.height / 2 - frame.offsetHeight / 2;
    const max = section.height - frame.offsetHeight - parseFloat(getComputedStyle(this.section().nativeElement).paddingBottom);
    this.frameY.set(Math.round(Math.min(Math.max(0, y), Math.max(0, max))));
  }

  leave() {
    this.active.set(false);
  }
}
