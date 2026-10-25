import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Address, Quote } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Cart } from '../../core/cart';
import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { TopBar } from '../../shared/top-bar';

type Method = 'upi' | 'cod';

const BLANK_ADDRESS = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };
type AddressForm = typeof BLANK_ADDRESS;

/** Checkout: where it goes, how it's paid, the final total, then the order. */
@Component({
  selector: 'mjk-checkout',
  imports: [TopBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout {
  private api = inject(Api).client;
  private router = inject(Router);
  readonly cart = inject(Cart);
  readonly shop = inject(Store).shop;
  readonly money = money;

  readonly addresses = signal<Address[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly chosen = signal<number | null>(null);
  readonly method = signal<Method>('upi');

  readonly adding = signal(false);
  readonly form = signal<AddressForm>({ ...BLANK_ADDRESS });
  readonly savingAddress = signal(false);
  readonly addressError = signal('');

  readonly quote = signal<Quote | null>(null);
  readonly quoting = signal(false);
  readonly placing = signal(false);
  readonly error = signal('');
  readonly problems = signal<string[]>([]);

  readonly codAllowed = computed(() => this.shop()?.cod_enabled ?? false);
  readonly canPlace = computed(
    () => !!this.chosen() && !!this.quote() && !this.quote()!.problems.length && !this.quoting() && !this.placing(),
  );

  constructor() {
    void this.cart.load();
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const { data } = await this.api.GET('/api/v1/me/addresses/');
      const list = data ?? [];
      this.addresses.set(list);
      this.failed.set(!data);
      const pick = list.find((a) => a.is_default) ?? list[0];
      if (pick) this.choose(pick.id);
      else this.adding.set(true);
    } catch {
      this.failed.set(true);
    }
    this.loading.set(false);
  }

  choose(id: number) {
    this.chosen.set(id);
    void this.requote();
  }

  pay(method: Method) {
    this.method.set(method);
    void this.requote();
  }

  setField(key: keyof AddressForm, value: string) {
    const clean = key === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : key === 'pincode' ? value.replace(/\D/g, '').slice(0, 6) : value;
    this.form.update((f) => ({ ...f, [key]: clean }));
    this.addressError.set('');
    return clean;
  }

  async saveAddress(event: Event) {
    event.preventDefault();
    if (this.savingAddress()) return;
    const f = this.form();
    const problem = !f.name.trim()
      ? 'Who should we hand the parcel to?'
      : !/^[6-9]\d{9}$/.test(f.phone)
        ? 'Enter a 10-digit mobile number for the courier.'
        : !f.line1.trim()
          ? 'Enter the house number and street.'
          : !f.city.trim() || !f.state.trim()
            ? 'Enter the city and state.'
            : !/^[1-9]\d{5}$/.test(f.pincode)
              ? 'Enter a 6-digit pincode.'
              : '';
    if (problem) return this.addressError.set(problem);
    this.savingAddress.set(true);
    try {
      const { data, error } = await this.api.POST('/api/v1/me/addresses/', {
        body: { ...f, is_default: !this.addresses().length },
      });
      if (data) {
        this.addresses.update((list) => [...list, data]);
        this.adding.set(false);
        this.form.set({ ...BLANK_ADDRESS });
        this.choose(data.id);
      } else {
        this.addressError.set(firstMessage(error) ?? 'We couldn’t save that address. Please check it and try again.');
      }
    } catch {
      this.addressError.set('We can’t reach the shop right now. Please try again.');
    }
    this.savingAddress.set(false);
  }

  /** Asks the shop for the real total (delivery, COD fee, stock checks) for this address and payment. */
  async requote() {
    const address = this.chosen();
    if (!address) return;
    this.quoting.set(true);
    this.error.set('');
    try {
      const { data } = await this.api.POST('/api/v1/checkout/quote/', {
        body: { address, payment_method: this.method(), coupon: '' },
      });
      this.quote.set(data ?? null);
      this.problems.set(data?.problems ?? []);
      if (!data) this.error.set('We couldn’t work out the total. Please try again.');
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.quoting.set(false);
  }

  async place() {
    const address = this.chosen();
    if (!address || !this.canPlace()) return;
    this.placing.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.api.POST('/api/v1/orders/', {
        body: { address, payment_method: this.method(), coupon: '' },
      });
      if (data?.number) {
        this.cart.reset();
        await this.router.navigateByUrl(`/orders/${data.number}`);
        return;
      }
      const refused = error as { detail?: string; problems?: string[] } | undefined;
      this.problems.set(refused?.problems ?? []);
      this.error.set(refused?.detail ?? 'We couldn’t place the order. Please try again.');
    } catch {
      this.error.set('We can’t reach the shop right now. Your order wasn’t placed; please try again.');
    }
    this.placing.set(false);
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
