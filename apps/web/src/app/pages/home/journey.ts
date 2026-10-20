import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';

import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { Reveal } from '../../shared/reveal';

interface Moment {
  caption: string;
  text: string;
  picture?: string;
  video?: string;
  alt?: string;
  space: number;
}

/** The order's journey, left to right: what happens between "add to cart" and the door. */
@Component({
  selector: 'mjk-journey',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journey.html',
  styleUrl: './journey.css',
})
export class Journey {
  private store = inject(Store);
  private row = viewChild.required<ElementRef<HTMLElement>>('row');
  readonly progress = signal(0);

  readonly moments = computed<Moment[]>(() => {
    const s = this.store.shop();
    const cod = s?.cod_enabled ? `cash on delivery up to ${money(s.cod_max_order)}, or ` : '';
    return [
      { caption: 'You choose', space: 96, picture: 'pictures/darjeeling-india-indian-spices-seeds-and-nuts.jpg',
        alt: 'Open sacks of spices, seeds and nuts at a market in Darjeeling',
        text: 'Every product page says what it is, what it weighs and what it costs, before you add it.' },
      { caption: 'Someone made it', space: 132, picture: 'pictures/weaving-tant-saree-poster.jpg',
        video: 'pictures/weaving-tant-saree.webm',
        alt: 'A tant saree being woven on a wooden handloom in Phulia, West Bengal, with orange and yellow warp',
        text: 'Most of what we sell was woven, pressed, roasted or polished by hand before it reached us.' },
      { caption: 'You pay', space: 80, picture: 'pictures/postcard-bearing-a-patiala-state-postage-stamp.jpg',
        alt: 'A one anna Patiala State postage stamp on an old postcard',
        text: `Pay ${cod}by UPI. A person checks each UPI payment against our bank before we pack.` },
      { caption: 'We pack it by hand', space: 120,
        text: 'Each item is ticked off a printed packing list, wrapped, and labelled with your pincode in large type.' },
      { caption: 'A courier collects it', space: 88, picture: 'pictures/nswgr-porters-load-mail-onto-mail-van.jpg',
        alt: 'Porters in caps loading sacks of mail onto a railway mail van, early 1900s',
        text: 'DHL or The Professional Couriers pick it up. You get the tracking number by email that day.' },
      { caption: 'It crosses India', space: 140, picture: 'pictures/british-era-letter-box-in-shimla-india.jpg',
        alt: 'A red India Post pillar box from about 1856 under a tree in Shimla',
        text: 'Hill towns, coastal towns, the street with no name on the map: if it has a pincode, it gets there.' },
      { caption: 'It reaches your door', space: 104, picture: 'pictures/india-post-letter-box-local.jpg',
        alt: 'A green India Post letter box on a railing outside a post office in Anand, Gujarat',
        text: 'The courier marks it delivered and so do we. Something wrong? Write to us and a person answers.' },
    ];
  });

  constructor() {
    // With reduced motion the clip shows its poster frame and stays still.
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.row().nativeElement.querySelectorAll('video').forEach((v) => { v.autoplay = false; v.pause(); });
      }
    });
  }

  onScroll() {
    const el = this.row().nativeElement;
    const max = el.scrollWidth - el.clientWidth;
    this.progress.set(max > 0 ? el.scrollLeft / max : 0);
  }

  step(direction: 1 | -1) {
    const el = this.row().nativeElement;
    const column = el.querySelector('li')?.getBoundingClientRect().width ?? 300;
    el.scrollBy({ left: direction * (column + 32), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
