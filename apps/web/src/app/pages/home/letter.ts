import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { Store } from '../../core/store';
import { Reveal } from '../../shared/reveal';

// The sheet's bottom edge, cut like pinking shears: 40 teeth.
const TEETH = 40;
const EDGE = Array.from({ length: TEETH * 2 + 1 }, (_, i) => `${(i / (TEETH * 2)) * 100}% ${i % 2 ? '100%' : 'calc(100% - 10px)'}`);
const SHEET_CLIP = `polygon(0 0, 100% 0, ${EDGE.reverse().join(', ')})`;

/** The shop's story, written by the admins in settings, as a letter on a sheet with a tear-off strip. */
@Component({
  selector: 'mjk-letter',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './letter.html',
  styleUrl: './letter.css',
})
export class Letter {
  private store = inject(Store);
  readonly shop = this.store.shop;
  readonly clip = SHEET_CLIP;
  readonly paragraphs = computed(() =>
    (this.shop()?.story ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
  );
  readonly initials = computed(() =>
    (this.shop()?.shop_name ?? 'MJK').split(/\s+/)[0].slice(0, 3).toUpperCase(),
  );
}
