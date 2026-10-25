import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { CatalogAdmin } from './catalog-admin';

/** Shelves are the shop's categories: Electronics today, Rings or Vegetables tomorrow. */
@Component({
  selector: 'mjk-shelves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="shelves-title">
      <h2 id="shelves-title">Shelves</h2>
      <p class="hint">Buyers see a tab for each shown shelf. Hiding a shelf hides every product on it.</p>
      @if (catalog.shelves().length) {
        <ul class="rows" role="list">
          @for (shelf of catalog.shelves(); track shelf.id) {
            <li class="row row--shelf" [class.row--hidden]="!shelf.is_active">
              <div class="row__about">
                <h3>{{ shelf.name }}</h3>
                <p class="num">{{ catalog.countOn().get(shelf.id) ?? 0 }} products</p>
              </div>
              <button
                type="button"
                class="switch"
                role="switch"
                [attr.aria-checked]="shelf.is_active"
                [attr.aria-label]="'Show the ' + shelf.name + ' shelf to buyers'"
                [disabled]="catalog.toggling() === 'shelf:' + shelf.id"
                (click)="toggle(shelf)"
              >
                <span class="switch__track" aria-hidden="true"><span class="switch__knob"></span></span>
                <span class="switch__text">{{ shelf.is_active ? 'Shown' : 'Hidden' }}</span>
              </button>
            </li>
          }
        </ul>
      } @else if (!catalog.loading()) {
        <p class="hint">No shelves yet. Add one below, like Rings or Vegetables.</p>
      }
      <form class="inline" (submit)="add($event)" novalidate>
        <label for="shelf-name" class="visually-hidden">New shelf name</label>
        <input
          id="shelf-name"
          type="text"
          maxlength="80"
          placeholder="New shelf, e.g. Necklaces"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
        />
        <button class="button" type="submit" [disabled]="adding()">{{ adding() ? 'Adding…' : 'Add shelf' }}</button>
      </form>
      <p class="error" role="alert">{{ error() }}</p>
    </section>
  `,
  styleUrls: ['./admin.css', './admin-rows.css'],
})
export class Shelves {
  readonly catalog = inject(CatalogAdmin);
  readonly name = signal('');
  readonly adding = signal(false);
  readonly error = signal('');

  async toggle(shelf: Parameters<CatalogAdmin['toggleShelf']>[0]) {
    this.error.set(await this.catalog.toggleShelf(shelf));
  }

  async add(event: Event) {
    event.preventDefault();
    const name = this.name().trim();
    if (!name) {
      this.error.set('Give the shelf a name.');
      return;
    }
    if (this.catalog.shelves().some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      this.error.set(`There’s already a ${name} shelf.`);
      return;
    }
    this.adding.set(true);
    const error = await this.catalog.addShelf(name);
    this.error.set(error);
    if (!error) this.name.set('');
    this.adding.set(false);
  }
}
