import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { Store } from '../../core/store';
import { money } from '../../shared/money';
import { Reveal } from '../../shared/reveal';

/** Every rule a buyer asks about, answered as reading text from the live shop settings. */
@Component({
  selector: 'mjk-questions',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section id="questions" class="faq" aria-labelledby="faq-title" mjkReveal>
      <h2 id="faq-title" class="rise">Questions</h2>
      <div class="answers rise">
        @for (qa of items(); track qa[0]) {
          <p><strong>{{ qa[0] }}</strong> {{ qa[1] }}</p>
        }
      </div>
    </section>
  `,
  styleUrl: './questions.css',
})
export class Questions {
  private store = inject(Store);

  readonly items = computed<[string, string][]>(() => {
    const s = this.store.shop();
    const fee = money(s?.shipping_flat ?? 99);
    const free = money(s?.free_shipping_above ?? 999);
    const contact = s?.support_email ? `Write to ${s.support_email}` : 'Write to us';
    const codFee = Number(s?.cod_fee ?? 0) > 0 ? ` A ${money(s?.cod_fee)} cash handling fee is added.` : ' There is no extra fee.';
    return [
      ['Where do you deliver?', 'To every pincode in India, by DHL or The Professional Couriers, whichever reaches yours best.'],
      ['What does delivery cost?', `${fee} an order, and nothing at all once your items come to ${free} or more after any coupon.`],
      ['Can I pay cash on delivery?', s?.cod_enabled
        ? `Yes, on orders up to ${money(s.cod_max_order)}.${codFee}`
        : 'Not at the moment; every order is paid by UPI before we pack it.'],
      ['How do I pay by UPI?', `Pay the order total${s?.upi_id ? ' to ' + s.upi_id : ''} or scan the QR on your order page, then send us the reference number or a screenshot. A person checks it and confirms your order.`],
      ['How soon will it arrive?', 'We pack within two working days of your order being confirmed. Most parcels arrive three to seven days after that, depending on the pincode.'],
      ['Can I cancel?', 'Yes, from your order page, until we start packing. If you paid by UPI we refund you in full.'],
      ['How do I track my parcel?', 'The day it ships we email you the courier, the tracking number and a link. It is on your order page too.'],
      ['Do I need a password?', 'No. You log in with your email and we send you a six-digit code each time.'],
      ['Something arrived damaged?', `${contact} within two days with a photo, and we replace it or refund you.`],
      ['Can I use a coupon?', 'Type the code at checkout. Most coupons work once per customer and the checkout tells you if one does not apply.'],
    ];
  });
}
