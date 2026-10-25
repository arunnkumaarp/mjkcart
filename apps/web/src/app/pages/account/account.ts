import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Cart } from '../../core/cart';
import { TopBar } from '../../shared/top-bar';

/** The logged-in person's own details, and a new password (also the way back in after forgetting one). */
@Component({
  selector: 'mjk-account',
  imports: [TopBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account {
  private api = inject(Api).client;
  readonly auth = inject(Auth);
  private cart = inject(Cart);
  private router = inject(Router);

  readonly name = signal(this.auth.user()?.first_name ?? '');
  readonly phone = signal(this.auth.user()?.phone ?? '');
  readonly savingDetails = signal(false);
  readonly detailsNote = signal('');
  readonly detailsError = signal('');

  readonly password = signal('');
  readonly again = signal('');
  readonly show = signal(false);
  readonly savingPassword = signal(false);
  readonly passwordNote = signal('');
  readonly passwordError = signal('');

  logout() {
    this.auth.logout();
    this.cart.reset();
    void this.router.navigateByUrl('/');
  }

  async saveDetails(event: Event) {
    event.preventDefault();
    const first_name = this.name().trim();
    const phone = this.phone().replace(/\D/g, '');
    if (!first_name) return this.detailsError.set('Type your name, so the courier knows who to ask for.');
    if (phone && phone.length !== 10) return this.detailsError.set('Type a 10-digit mobile number, like 9876543210.');
    this.savingDetails.set(true);
    this.detailsError.set('');
    this.detailsNote.set('');
    try {
      const { data, error } = await this.api.PATCH('/api/v1/me/', { body: { first_name, phone } });
      if (data) {
        this.auth.setUser(data);
        this.detailsNote.set('Saved.');
      } else {
        this.detailsError.set(firstMessage(error) ?? 'That didn’t save. Please try again.');
      }
    } catch {
      this.detailsError.set('We can’t reach the shop right now. Please try again.');
    }
    this.savingDetails.set(false);
  }

  async savePassword(event: Event) {
    event.preventDefault();
    const password = this.password();
    if (password.length < 8) return this.passwordError.set('Use at least 8 characters.');
    if (password !== this.again()) return this.passwordError.set('The two passwords don’t match. Type them again.');
    this.savingPassword.set(true);
    this.passwordError.set('');
    this.passwordNote.set('');
    try {
      const { response, error } = await this.api.POST('/api/v1/me/password/', { body: { password } });
      if (response.ok) {
        this.password.set('');
        this.again.set('');
        this.passwordNote.set('Your new password is set. Use it next time you log in.');
      } else {
        this.passwordError.set(firstMessage(error) ?? 'That didn’t save. Please try again.');
      }
    } catch {
      this.passwordError.set('We can’t reach the shop right now. Please try again.');
    }
    this.savingPassword.set(false);
  }
}

function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const value of Object.values(error)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}
