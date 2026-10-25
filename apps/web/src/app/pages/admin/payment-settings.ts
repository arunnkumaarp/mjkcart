import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ShopSettings } from '@mjkcart/api';

import { Api } from '../../core/api';
import { Store } from '../../core/store';

/** The shop's UPI ID and QR code, which buyers scan to pay for UPI orders. Admins only. */
@Component({
  selector: 'mjk-payment-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="field" aria-labelledby="upi-title">
      <h2 id="upi-title">UPI payments</h2>
      <p class="hint">Buyers who choose UPI see this QR code and the amount to pay, then send you the payment reference.</p>

      @if (loading()) {
        <p class="hint" role="status">Fetching the payment details…</p>
      } @else {
        <div class="qr">
          @if (preview() ?? settings()?.upi_qr; as src) {
            <img [src]="src" alt="The shop's UPI QR code" width="180" height="180" />
          } @else {
            <p class="qr__empty">No QR code yet</p>
          }
        </div>

        <form (submit)="save($event, picker)" novalidate>
          <label for="upi-id">UPI ID</label>
          <input
            id="upi-id"
            type="text"
            autocapitalize="none"
            spellcheck="false"
            placeholder="shopname@okaxis"
            [value]="upiId()"
            (input)="upiId.set($any($event.target).value)"
          />
          <label for="upi-qr">QR code image</label>
          <input #picker id="upi-qr" type="file" accept="image/png,image/jpeg,image/webp" (change)="onPick(picker)" />
          <p class="hint">Download it from your UPI or bank app (PhonePe, GPay, Paytm Business…) and upload it here.</p>
          <div class="actions">
            <button class="button" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save payment details' }}</button>
            @if (settings()?.upi_qr && !file()) {
              <button type="button" class="link" (click)="removeQr()" [disabled]="saving()">Remove QR code</button>
            }
          </div>
          <p class="note" role="status">{{ note() }}</p>
          <p class="error" role="alert">{{ error() }}</p>
        </form>
      }
    </section>
  `,
  styleUrl: './admin.css',
  styles: `
    .qr {
      display: grid; place-items: center; width: 212px; aspect-ratio: 1; padding: 16px;
      border: 2px dashed var(--paper-ink); background: var(--paper);
    }
    .qr img { width: 100%; height: 100%; object-fit: contain; }
    .qr__empty { font-size: var(--step-small); color: var(--paper-muted); text-align: center; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
    .actions .button { margin: 0; }
    .link {
      min-height: 44px; padding: 0; border: 0; background: none; cursor: pointer;
      font-size: var(--step-small); font-weight: 600; text-decoration: underline; text-underline-offset: 4px;
    }
  `,
})
export class PaymentSettings {
  private api = inject(Api).client;
  private store = inject(Store);

  readonly settings = signal<ShopSettings | null>(null);
  readonly loading = signal(true);
  readonly upiId = signal('');
  readonly file = signal<File | null>(null);
  /** A local preview of the picked file, before it's saved. */
  readonly preview = computed(() => {
    const f = this.file();
    return f ? URL.createObjectURL(f) : null;
  });
  readonly saving = signal(false);
  readonly note = signal('');
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load() {
    try {
      const { data } = await this.api.GET('/api/v1/staff/shop/');
      if (data) {
        this.settings.set(data);
        this.upiId.set(data.upi_id ?? '');
      } else {
        this.error.set('We couldn’t load the payment details. Reload the page to try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Reload the page to try again.');
    }
    this.loading.set(false);
  }

  onPick(input: HTMLInputElement) {
    const f = input.files?.[0] ?? null;
    this.error.set('');
    this.note.set('');
    if (f && f.size > 5 * 1024 * 1024) {
      this.error.set('That image is over 5 MB. Please pick a smaller one.');
      input.value = '';
      return;
    }
    this.file.set(f);
  }

  async save(event: Event, picker: HTMLInputElement) {
    event.preventDefault();
    if (this.saving()) return;
    const upi = this.upiId().trim();
    if (upi && !/^[\w.-]{2,}@[A-Za-z]{2,}$/.test(upi)) {
      this.error.set('Enter a UPI ID like shopname@okaxis.');
      return;
    }
    const file = this.file();
    const ok = await this.send(
      () => {
        const data = new FormData();
        data.append('upi_id', upi);
        if (file) data.append('upi_qr', file);
        return data;
      },
      file ? 'Saved. Buyers paying by UPI will see this QR code.' : 'Saved.',
    );
    if (ok) {
      this.file.set(null);
      picker.value = '';
    }
  }

  async removeQr() {
    // An empty upi_qr removes the image.
    await this.send(() => {
      const data = new FormData();
      data.append('upi_qr', '');
      return data;
    }, 'QR code removed. Buyers won’t see a QR code until you upload a new one.');
  }

  private async send(form: () => FormData, done: string) {
    this.saving.set(true);
    this.error.set('');
    this.note.set('');
    let ok = false;
    try {
      const { data, error } = await this.api.PATCH('/api/v1/staff/shop/', {
        body: {},
        bodySerializer: form,
      });
      if (data) {
        ok = true;
        this.settings.set(data);
        this.store.shop.update((s) => (s ? { ...s, upi_id: data.upi_id, upi_qr: data.upi_qr ?? undefined } : s));
        this.note.set(done);
      } else {
        this.error.set(firstMessage(error) ?? 'We couldn’t save the payment details. Please try again.');
      }
    } catch {
      this.error.set('We can’t reach the shop right now. Please try again.');
    }
    this.saving.set(false);
    return ok;
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
