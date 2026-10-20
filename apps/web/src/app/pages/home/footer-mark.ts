import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Store } from '../../core/store';

interface Credit { title: string; creator: string; license: string; page: string; }

const BLOCKS = [
  { bg: 'var(--bg)', h: 100 },
  { bg: 'var(--paper)', h: 74 },
  { bg: '#ffb27a', h: 88 },
  { bg: 'var(--surface)', h: 64 },
];

/** The back of the object: the name built from blocks, the links, and the picture credits. */
@Component({
  selector: 'mjk-footer-mark',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer-mark.html',
  styleUrl: './footer-mark.css',
})
export class FooterMark {
  readonly store = inject(Store);
  readonly shop = this.store.shop;
  readonly year = new Date().getFullYear();
  readonly credits = signal<Credit[]>([]);

  readonly letters = computed(() => {
    const word = (this.shop()?.shop_name ?? 'MJK').split(/\s+/)[0].toUpperCase().slice(0, 6);
    return [...word].map((char, i) => ({ char, ...BLOCKS[i % BLOCKS.length] }));
  });

  constructor() {
    fetch('pictures/credits.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Credit[]) => this.credits.set(list))
      .catch(() => {});
  }

  top() {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
