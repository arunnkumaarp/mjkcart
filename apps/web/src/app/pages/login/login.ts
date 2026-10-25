import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { User } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Store } from '../../core/store';

/**
 * One login for buyers and the shop team: username (or email) and password, then each goes to their home.
 * An emailed 6-digit code is the fallback for accounts without a password.
 */
@Component({
  selector: 'mjk-login',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private api = inject(Api).client;
  private auth = inject(Auth);
  private router = inject(Router);
  readonly shop = inject(Store).shop;

  readonly step = signal<'password' | 'email' | 'code'>('password');
  readonly username = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly email = signal('');
  readonly code = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly note = signal('');

  onCode(value: string) {
    this.code.set(value.replace(/\D/g, '').slice(0, 6));
  }

  async logIn(event: Event) {
    event.preventDefault();
    if (this.busy()) return;
    const username = this.username().trim();
    if (!username || !this.password()) {
      this.error.set('Enter your username or email and your password.');
      return;
    }
    await this.run(async () => {
      const { data, error, response } = await this.api.POST('/api/v1/auth/login/', {
        body: { username, password: this.password() },
      });
      if (data) return this.finish(data);
      this.error.set(
        response.status === 429
          ? 'Too many tries. Wait a minute, then try again.'
          : (detail(error) ?? 'Wrong username or password.'),
      );
    });
  }

  async sendCode(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    const email = this.email().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter the email address you shop with.');
      return;
    }
    await this.run(async () => {
      const { data, error } = await this.api.POST('/api/v1/auth/otp/send/', { body: { email } });
      if (data) {
        this.step.set('code');
        this.code.set('');
        this.note.set(`We sent a 6-digit code to ${email}. It works for 10 minutes.`);
      } else {
        this.error.set(detail(error) ?? 'We couldn’t send the code. Please try again.');
      }
    });
  }

  async verify(event: Event) {
    event.preventDefault();
    if (this.busy()) return;
    if (this.code().length !== 6) {
      this.error.set('The code has 6 digits.');
      return;
    }
    await this.run(async () => {
      const { data, error } = await this.api.POST('/api/v1/auth/otp/verify/', {
        body: { email: this.email().trim(), code: this.code() },
      });
      if (data) return this.finish(data);
      this.error.set(detail(error) ?? 'That code didn’t work. Please try again.');
    });
  }

  useCode() {
    this.step.set('email');
    this.error.set('');
    this.note.set('');
    if (!this.email() && this.username().includes('@')) this.email.set(this.username().trim());
  }

  usePassword() {
    this.step.set('password');
    this.error.set('');
    this.note.set('');
  }

  private async finish(data: { access: string; refresh: string; user: User }) {
    this.auth.setSession(data.access, data.refresh, data.user);
    await this.router.navigateByUrl(this.auth.home());
  }

  private async run(work: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch {
      this.error.set('We can’t reach the shop right now. Check your connection and try again.');
    }
    this.busy.set(false);
  }
}

function detail(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') return error.detail;
  return undefined;
}
