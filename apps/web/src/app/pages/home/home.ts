import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FooterMark } from './footer-mark';
import { Hero } from './hero';
import { Journey } from './journey';
import { Letter } from './letter';
import { Questions } from './questions';
import { ShopIndex } from './shop-index';
import { Showcase } from './showcase';

/** The storefront home, built as MJK's shipping label and the folders behind it. */
@Component({
  selector: 'mjk-home',
  imports: [Hero, ShopIndex, Showcase, Journey, Letter, Questions, FooterMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mjk-hero />
    <main>
      <mjk-shop-index />
      <mjk-showcase />
      <mjk-journey />
      <mjk-letter />
      <mjk-questions />
    </main>
    <mjk-footer-mark />
  `,
})
export class Home {}
