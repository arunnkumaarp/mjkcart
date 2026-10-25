import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';

import { Api } from '../../core/api';
import { Store } from '../../core/store';

/** The shop's name and one-line pitch: what turns the same site into a jewellery or grocery shop. */
@Component({
  selector: 'mjk-shop-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="shop-title">
      <h2 id="shop-title">Shop details</h2>
      <p class="hint">Shown on the login page, the top bar and the shop. Change them when the shop changes what it sells.</p>
      <form (submit)="save($event)" novalidate>
        <label for="s-name">Shop name</label>
        <input id="s-name" type="text" maxlength="80" [value]="name()" (input)="name.set($any($event.target).value)" />
        <label for="s-tagline">Tagline</label>
        <input
          id="s-tagline"
          type="text"
          maxlength="120"
          placeholder="Gold and silver, made to last."
          [value]="tagline()"
          (input)="tagline.set($any($event.target).value)"
        />
        <button class="button" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save details' }}</button>
        <p class="note" role="status">{{ note() }}</p>
        <p class="error" role="alert">{{ error() }}</p>
      </form>
    </section>
  `,
  styleUrl: './admin.css',
})
export class ShopDetails {
  private api = inject(Api).client;
  private store = inject(Store);

  readonly name = signal('');
  readonly tagline = signal('');
  readonly saving = signal(false);
  readonly note = signal('');
  readonly error = signal('');

  constructor() {
    // Fill the form once the shop settings arrive.
    effect(() => {
      const shop = this.store.shop();
      if (shop && !this.name()) {
        this.name.set(shop.shop_name ?? '');
        this.tagline.set(shop.tagline ?? '');
      }
    });
  }

  async save(event: Event) {
    event.preventDefault();
    if (this.saving()) return;
    const shop_name = this.name().trim();
    if (!shop_name) {
      this.error.set('The shop needs a name.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.note.set('');
    try {
      const { data } = await this.api.PATCH('/api/v1/staff/shop/', {
        body: { shop_name, tagline: this.tagline().trim() },
      });
      if (data) {
        this.store.shop.update((s) => (s ? { ...s, shop_name: data.shop_name, tagline: data.tagline } : s));
        this.note.set('Saved. Buyers see the new name and tagline now.');
      } else {
        this.error.set('We couldn’t save the details. Please try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.saving.set(false);
  }
}
