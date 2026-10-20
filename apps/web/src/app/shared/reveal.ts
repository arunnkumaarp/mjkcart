import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/** Adds .is-in once the element scrolls into view, so its .rise children enter in turn. */
@Directive({ selector: '[mjkReveal]' })
export class Reveal implements OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      const node = this.el.nativeElement;
      node.querySelectorAll('.rise').forEach((child: Element, i: number) => {
        (child as HTMLElement).style.setProperty('--i', String(i));
      });
      if (!('IntersectionObserver' in window)) {
        node.classList.add('is-in');
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            node.classList.add('is-in');
            this.observer?.disconnect();
          }
        },
        { threshold: 0, rootMargin: '0px 0px -12% 0px' },
      );
      this.observer.observe(node);
    });
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
