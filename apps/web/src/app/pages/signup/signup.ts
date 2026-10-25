import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Store } from '../../core/store';

/** New buyers make their own account (name, email, mobile, password) and are logged straight in. */
@Component({
  selector: 'mjk-signup',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './signup.html',
  styleUrl: '../login/login.css',
})
export class Signup {
  private api = inject(Api).client;
  private auth = inject(Auth);
  private router = inject(Router);
  readonly shop = inject(Store).shop;

  readonly name = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  onPhone(value: string) {
    this.phone.set(value.replace(/\D/g, '').slice(0, 10));
  }

  async create(event: Event) {
    event.preventDefault();
    if (this.busy()) return;
    const problem = this.check();
    if (problem) return this.error.set(problem);
    this.busy.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.api.POST('/api/v1/auth/signup/', {
        body: { name: this.name().trim(), email: this.email().trim(), phone: this.phone(), password: this.password() },
      });
      if (data) {
        this.auth.setSession(data.access, data.refresh, data.user);
        await this.router.navigateByUrl(this.auth.home());
      } else {
        this.error.set(firstMessage(error) ?? 'We couldn’t make your account. Please check your details and try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Check your connection and try again.');
    }
    this.busy.set(false);
  }

  private check() {
    if (!this.name().trim()) return 'Tell us your name.';
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) return 'Enter your email address, like you@example.com.';
    if (!/^[6-9]\d{9}$/.test(this.phone())) return 'Enter a 10-digit mobile number.';
    if (this.password().length < 8) return 'Choose a password of at least 8 characters.';
    return '';
  }
}

/** The first message the server sent back, e.g. {"email": ["There is already an account…"]}, or a throttle detail. */
function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const value of Object.values(error)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}
