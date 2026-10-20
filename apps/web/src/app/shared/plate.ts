import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Product } from '@mjkcart/api';

type Shape = 'pouch' | 'tin' | 'bottle' | 'vial' | 'lamp' | 'cloth' | 'cushion' | 'book' | 'comb' | 'parcel';

// Words in a product's name → the object drawn for it, and the colour of its material.
const SHAPES: [RegExp, Shape, string][] = [
  [/coffee/i, 'pouch', '#4a2c1a'],
  [/chai|tea/i, 'tin', '#a8322d'],
  [/face oil|serum|vial/i, 'vial', '#9a5b12'],
  [/oil|ghee|honey/i, 'bottle', '#c8902a'],
  [/copper/i, 'bottle', '#b8643b'],
  [/diya|lamp|brass/i, 'lamp', '#c9a227'],
  [/towel|saree|dupatta|stole/i, 'cloth', '#26346b'],
  [/cushion|pillow/i, 'cushion', '#a8322d'],
  [/notebook|journal|diary|paper/i, 'book', '#d9cdb4'],
  [/comb|wood/i, 'comb', '#a0784a'],
];

// Variant names that are colours tint the drawing.
const COLOURS: Record<string, string> = {
  indigo: '#26346b', turmeric: '#e0a526', natural: '#e3d8c3', 'madder red': '#a8322d', red: '#a8322d',
  black: '#1b1b1b', white: '#f4f4f2', green: '#3d6b45', blue: '#2a4f8f', yellow: '#e0a526',
};

/** A product drawn in flat shapes, used until the shop uploads its own photographs. */
@Component({
  selector: 'mjk-plate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photo(); as src) {
      <img [src]="src" [alt]="product().name" width="800" height="800" loading="lazy" />
    } @else {
      <svg viewBox="0 0 400 400" role="img" [attr.aria-label]="product().name">
        <rect width="400" height="400" [attr.fill]="ground()" />
        @switch (shape()) {
          @case ('pouch') {
            <path d="M120 120 L280 120 L300 330 L100 330 Z" [attr.fill]="colour()" />
            <rect x="120" y="96" width="160" height="30" [attr.fill]="colour()" />
            <rect x="120" y="96" width="160" height="10" fill="#050f16" opacity=".35" />
            <rect x="150" y="190" width="100" height="90" fill="#ff7a1f" />
            <circle cx="200" cy="235" r="26" [attr.fill]="colour()" />
          }
          @case ('tin') {
            <rect x="125" y="110" width="150" height="220" [attr.fill]="colour()" />
            <rect x="118" y="96" width="164" height="34" fill="#050f16" />
            <rect x="125" y="180" width="150" height="80" fill="#ffffff" />
            <circle cx="200" cy="220" r="24" fill="#c9a227" />
          }
          @case ('bottle') {
            <rect x="180" y="70" width="40" height="40" fill="#050f16" />
            <path d="M185 110 L215 110 L215 140 L260 180 L260 330 L140 330 L140 180 L185 140 Z" [attr.fill]="colour()" />
            <rect x="140" y="215" width="120" height="70" fill="#ffffff" />
            <rect x="160" y="240" width="80" height="18" [attr.fill]="colour()" />
          }
          @case ('vial') {
            <rect x="182" y="90" width="36" height="60" fill="#050f16" />
            <rect x="160" y="150" width="80" height="180" [attr.fill]="colour()" />
            <rect x="160" y="210" width="80" height="60" fill="#ffffff" />
          }
          @case ('lamp') {
            <path d="M90 230 Q200 330 310 230 Z" [attr.fill]="colour()" />
            <path d="M150 230 Q200 200 250 230 Z" fill="#050f16" opacity=".25" />
            <path d="M200 120 Q228 170 200 205 Q172 170 200 120 Z" fill="#ff7a1f" />
            <path d="M200 150 Q212 175 200 195 Q188 175 200 150 Z" fill="#ffffff" />
            <rect x="170" y="300" width="60" height="30" [attr.fill]="colour()" />
          }
          @case ('cloth') {
            <rect x="90" y="120" width="220" height="70" [attr.fill]="colour()" />
            <rect x="90" y="190" width="220" height="70" [attr.fill]="colour()" opacity=".85" />
            <rect x="90" y="260" width="220" height="40" [attr.fill]="colour()" opacity=".7" />
            <rect x="90" y="150" width="220" height="8" fill="#ffffff" opacity=".7" />
            <rect x="90" y="222" width="220" height="8" fill="#ffffff" opacity=".7" />
          }
          @case ('cushion') {
            <rect x="100" y="100" width="200" height="200" [attr.fill]="colour()" />
            @for (p of dots; track $index) {
              <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="14" fill="#ffffff" />
            }
          }
          @case ('book') {
            <rect x="120" y="90" width="170" height="230" [attr.fill]="colour()" />
            <rect x="110" y="90" width="22" height="230" fill="#050f16" />
            <rect x="170" y="150" width="90" height="40" fill="#ff7a1f" />
          }
          @case ('comb') {
            <rect x="80" y="150" width="240" height="40" [attr.fill]="colour()" />
            @for (x of teeth; track x) {
              <rect [attr.x]="x" y="190" width="10" height="80" [attr.fill]="colour()" />
            }
          }
          @default {
            <rect x="90" y="130" width="220" height="170" fill="#c9915b" />
            <rect x="90" y="130" width="220" height="30" fill="#050f16" opacity=".2" />
            <rect x="150" y="190" width="100" height="60" fill="#ffffff" />
          }
        }
      </svg>
    }
  `,
  styles: `
    :host { display: block; aspect-ratio: 1; overflow: hidden; }
    img, svg { width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class Plate {
  readonly product = input.required<Product>();
  /** The variant shown, so a colour choice recolours the drawing. */
  readonly variantLabel = input<string>('');
  readonly ground = input<string>('#f1f1ef');

  readonly photo = computed(() => this.product().images?.[0]?.image ?? null);
  private match = computed(() => SHAPES.find(([re]) => re.test(this.product().name)));
  readonly shape = computed<Shape>(() => this.match()?.[1] ?? 'parcel');
  readonly colour = computed(() => {
    const label = (this.variantLabel() || this.product().variants[0]?.label || '').toLowerCase();
    return COLOURS[label] ?? this.match()?.[2] ?? '#c9915b';
  });

  readonly dots = [130, 200, 270].flatMap((x) => [130, 200, 270].map((y) => [x, y]));
  readonly teeth = Array.from({ length: 14 }, (_, i) => 88 + i * 16.5);
}
