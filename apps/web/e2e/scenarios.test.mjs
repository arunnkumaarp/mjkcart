// End-to-end scenarios for buyers and the shop team, run in headless Chrome against the running app.
// Needs: docker compose up (backend on :8001) and npm start (web on :4200). Run: npm run e2e
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { launch } from './browser.mjs';
import { setUp, tearDown } from './stack.mjs';

const tag = Date.now().toString(36);
const SHELF = `E2E Shelf ${tag}`;
const PRODUCT = `E2E Lamp ${tag}`;
const COURIER = `E2E Courier ${tag}`;

let page;
let who; // the admin, staff and buyer accounts made for this run
const orders = {}; // order numbers the scenarios pass along

before(async () => {
  who = setUp(tag);
  page = await launch();
});

after(async () => {
  try {
    await page?.close();
  } finally {
    if (who) tearDown(who);
  }
});

/** Opens a tab of the admin desk as the admin. */
async function desk(tab) {
  await page.session(who.admin, tab === 'orders' ? '/admin' : `/admin?tab=${tab}`);
  await page.waitFor(`!!document.querySelector('.tab.is-here')`, 'the admin desk tabs');
  // Wait for the tab's own list, as a person would before using it.
  const ready = { orders: 'mjk-orders-desk .orders, mjk-orders-desk .hint', products: '.rows', shelves: 'mjk-shelves .rows',
    payments: 'mjk-payments-review .list, mjk-payments-review .hint', settings: '#s-tagline' }[tab];
  await page.present(ready);
}

/** Puts one of the test product in the buyer's cart from the shop and goes to checkout. */
async function buyOne() {
  await page.session(who.buyer, '/shop');
  await page.type('#shop-q', PRODUCT);
  await page.press('Add to cart', { within: '.card', near: PRODUCT });
  await page.waitForText('mjk-top-bar', 'Cart (');
  await page.goto('/checkout');
  await page.waitFor(`!!document.querySelector('.place')`, 'the checkout');
}

async function placeWith(method) {
  await page.eval(`[...document.querySelectorAll('.choice')].find((c) => c.innerText.includes(${JSON.stringify(method)})).querySelector('input').click()`);
  // The total is worked out again for the payment method; the button waits for it.
  const label = method === 'UPI' ? 'pay by UPI' : 'Place order';
  await page.waitFor(`(() => { const b = document.querySelector('.place'); return b && !b.disabled && b.innerText.includes(${JSON.stringify(label)}); })()`, 'the Place order button');
  await page.click('.place');
  await page.waitFor(`/^\\/orders\\/MJK\\d+$/.test(location.pathname)`, 'the new order page');
  return (await page.path()).split('/').pop();
}

describe('Logging in and signing up', () => {
  it('login page is a single form with a signup link', async () => {
    await page.loggedOut('/');
    await page.waitFor(`!!document.querySelector('#login-username')`);
    assert.equal(await page.exists('.slip__rules'), false, 'no side box');
    assert.match(await page.text('main'), /New here\? Create an account/);
  });

  it('a wrong password shows one clear message and stays on the login page', async () => {
    await page.login(who.admin.email, 'not-the-password');
    await page.waitForText('#login-error', 'Wrong username or password.');
    assert.equal(await page.path(), '/');
  });

  it('the admin logs in with email and password and lands on the admin desk', async () => {
    await page.login(who.admin.email, who.admin.password);
    await page.waitForPath('/admin');
    await page.waitForText('.tabs', 'Orders');
  });

  it('logging out goes back to the login page', async () => {
    await page.press('Log out', { within: 'mjk-top-bar' });
    await page.waitForPath('/');
    assert.equal(await page.eval(`localStorage.getItem('mjk.access')`), 'null');
  });

  it('a buyer logs in and lands on the shop', async () => {
    await page.login(who.buyer.email, who.buyer.password);
    await page.waitForPath('/shop');
    await page.waitForText('mjk-top-bar', 'My orders');
  });

  it('signup explains what is missing', async () => {
    await page.loggedOut('/signup');
    await page.waitFor(`!!document.querySelector('#signup-name')`);
    assert.equal(await page.exists('#signup-code'), false, 'no email code step');
    await page.click('form button[type=submit]');
    await page.waitForText('#signup-error', 'Tell us your name.');
    await page.type('#signup-name', 'E2E Signup');
    await page.type('#signup-email', `e2e-signup-${tag}@example.com`);
    await page.type('#signup-phone', '12345');
    await page.click('form button[type=submit]');
    await page.waitForText('#signup-error', 'Enter a 10-digit mobile number.');
  });

  it('signup saves the account, logs in, and the same details log in again', async () => {
    await page.type('#signup-phone', '9840012345');
    await page.type('#signup-password', 'signup-pass-2026');
    await page.click('form button[type=submit]');
    await page.waitForPath('/shop');
    await page.login(`e2e-signup-${tag}@example.com`, 'signup-pass-2026');
    await page.waitForPath('/shop');
  });

  it('signup refuses an email that already has an account', async () => {
    await page.loggedOut('/signup');
    await page.waitFor(`!!document.querySelector('#signup-name')`);
    await page.type('#signup-name', 'Someone');
    await page.type('#signup-email', `E2E-SIGNUP-${tag}@example.com`);
    await page.type('#signup-phone', '9840012346');
    await page.type('#signup-password', 'another-pass-2026');
    await page.click('form button[type=submit]');
    await page.waitForText('#signup-error', 'There is already an account with this email');
    assert.equal(await page.path(), '/signup');
  });

  it('each page lets in the right people and sends others home', async () => {
    const checks = [
      [null, '/shop', '/'], [null, '/admin', '/'], [null, '/cart', '/'],
      [who.buyer, '/', '/shop'], [who.buyer, '/admin', '/shop'], [who.buyer, '/admin/sales', '/shop'], [who.buyer, '/cart', '/cart'],
      [who.staff, '/', '/admin'], [who.staff, '/admin/sales', '/admin'], [who.staff, '/cart', '/admin'], [who.staff, '/checkout', '/admin'],
      [who.admin, '/', '/admin'], [who.admin, '/admin/sales', '/admin/sales'], [who.admin, '/orders', '/admin'],
    ];
    for (const [account, from, to] of checks) {
      if (account) await page.session(account, from);
      else await page.loggedOut(from);
      await page.waitForPath(to).catch(() => assert.fail(`${account?.user.role ?? 'logged out'} opening ${from} should end on ${to}`));
    }
  });

  it('an expired login is renewed quietly', async () => {
    // A token whose time ran out a minute ago; the app should swap it before calling the shop.
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = `${part({ alg: 'HS256' })}.${part({ exp: Math.floor(Date.now() / 1000) - 60 })}.x`;
    await page.session({ ...who.buyer, access: expired }, '/shop');
    await page.waitFor(`document.querySelectorAll('.card').length > 0`, 'products to show');
    assert.notEqual(await page.eval(`JSON.parse(localStorage.getItem('mjk.access'))`), expired, 'token was renewed');
  });

  it('a login that cannot be renewed goes back to the login page', async () => {
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = `${part({ alg: 'HS256' })}.${part({ exp: 1 })}.x`;
    await page.session({ ...who.buyer, access: expired, refresh: 'not-a-token' }, '/shop');
    await page.waitForPath('/');
    await page.waitFor(`!!document.querySelector('#login-username')`, 'the login form');
  });
});

describe('Admin desk: shelves, products and settings', () => {
  it('opens on Orders, with one tab per job', async () => {
    await desk('orders');
    const tabs = await page.text('.tabs');
    for (const t of ['Orders', 'Products', 'Shelves', 'Payments', 'Shop settings']) assert.match(tabs, new RegExp(t));
    assert.match(await page.text('mjk-top-bar'), /Sales/);
  });

  it('staff see no Shop settings tab and no Sales', async () => {
    await page.session(who.staff, '/admin');
    await page.waitForText('.tabs', 'Payments');
    assert.doesNotMatch(await page.text('.tabs'), /Shop settings/);
    assert.doesNotMatch(await page.text('mjk-top-bar'), /Sales/);
  });

  it('adds a shelf', async () => {
    await desk('shelves');
    await page.type('#shelf-name', SHELF);
    await page.press('Add shelf');
    await page.waitForText('mjk-shelves', SHELF);
  });

  it('adds a product to that shelf, and checks the form first', async () => {
    await desk('products');
    await page.press('+ Add a product');
    await page.press('Add product', { within: 'form.add' });
    await page.waitForText('form.add', 'Give the product a name.');
    await page.type('#p-name', PRODUCT);
    await page.choose('#p-shelf', SHELF);
    await page.type('#p-desc', 'A small desk lamp for the end-to-end tests.');
    await page.type('#p-price', '499');
    await page.type('#p-mrp', '999');
    await page.type('#p-stock', '10');
    await page.press('Add product', { within: 'form.add' });
    await page.waitForText('form.add', `${PRODUCT} is on the ${SHELF} shelf and shown to buyers`);
    await page.waitForText('.rows', PRODUCT);
  });

  it('edits the price and stock', async () => {
    await page.press('Edit', { within: '.row', near: PRODUCT });
    const row = `[...document.querySelectorAll('.row')].find((r) => r.innerText.includes(${JSON.stringify(PRODUCT)}))`;
    await page.waitFor(`!!${row}.querySelector('.editor')`, 'the editor');
    await page.eval(`(() => {
      const set = (sel, v) => { const el = ${row}.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('[id^=e-price-]', '449'); set('[id^=e-stock-]', '8');
    })()`);
    await page.press('Save', { within: '.row', near: PRODUCT });
    await page.waitForText('section.field > .note', `${PRODUCT} is saved.`);
    await page.waitFor(`${row}.innerText.includes('₹449') && ${row}.innerText.includes('8 in stock')`, 'the new price and stock');
  });

  it('a hidden product disappears for buyers and comes back when shown', async () => {
    await page.press('Shown', { within: '.row', near: PRODUCT });
    await page.waitFor(`[...document.querySelectorAll('.row')].find((r) => r.innerText.includes(${JSON.stringify(PRODUCT)})).querySelector('.switch__text').innerText === 'Hidden'`, 'the switch to say Hidden');
    await page.session(who.buyer, '/shop');
    await page.waitFor(`document.querySelectorAll('.card').length > 0`);
    assert.doesNotMatch(await page.text('main'), new RegExp(PRODUCT));

    await desk('products');
    await page.press('Hidden', { within: '.row', near: PRODUCT });
    await page.session(who.buyer, '/shop');
    await page.waitForText('main', PRODUCT);
  });

  it('hiding a shelf hides its products, and "Show that shelf" brings them back', async () => {
    await desk('shelves');
    await page.press('Shown', { within: '.row', near: SHELF });
    await page.waitFor(`[...document.querySelectorAll('.row')].find((r) => r.innerText.includes(${JSON.stringify(SHELF)})).innerText.includes('Hidden')`, 'the shelf to be hidden');
    await page.session(who.buyer, '/shop');
    await page.waitFor(`document.querySelectorAll('.card').length > 0`);
    assert.doesNotMatch(await page.text('main'), new RegExp(PRODUCT));

    await desk('products');
    await page.waitForText('.rows', PRODUCT);
    const row = `[...document.querySelectorAll('.row')].find((r) => r.innerText.includes(${JSON.stringify(PRODUCT)}))`;
    assert.match(await page.eval(`${row}.innerText`), /Hidden \(shelf\)/);
    await page.press('Show that shelf', { within: '.row', near: PRODUCT });
    await page.waitFor(`${row}.querySelector('.switch__text').innerText === 'Shown'`, 'the product to be shown again');
  });

  it('saves the shop tagline, and buyers see it', async () => {
    await desk('settings');
    await page.waitFor(`document.querySelector('#s-tagline')?.value !== undefined`);
    const before = await page.eval(`document.querySelector('#s-tagline').value`);
    try {
      await page.type('#s-tagline', `E2E tagline ${tag}`);
      await page.press('Save details');
      await page.waitForText('mjk-shop-details', 'Saved');
      await page.session(who.buyer, '/shop');
      await page.waitForText('.gallery__head', `E2E tagline ${tag}`);
    } finally {
      await desk('settings');
      await page.waitFor(`document.querySelector('#s-tagline')?.value === ${JSON.stringify(`E2E tagline ${tag}`)}`);
      await page.type('#s-tagline', before);
      await page.press('Save details');
      await page.waitForText('mjk-shop-details', 'Saved');
    }
  });

  it('the admin sees the shop as a preview, without a cart', async () => {
    await page.session(who.admin, '/shop');
    await page.waitForText('.preview', 'Preview');
    assert.equal(await page.exists('.card__add'), false);
    assert.doesNotMatch(await page.text('mjk-top-bar'), /Cart \(/, 'no cart link');
  });
});

describe('Buyer: shopping and ordering', () => {
  it('searches, sorts and explains when nothing matches', async () => {
    await page.session(who.buyer, '/shop');
    await page.type('#shop-q', PRODUCT);
    await page.waitForText('.found', '1 product for');
    await page.type('#shop-q', 'zzzz-nothing');
    await page.waitForText('main', 'Nothing matches');
    await page.press('Show everything');
    await page.choose('#shop-sort', 'low to high');
    const prices = await page.eval(`[...document.querySelectorAll('.card__price strong')].map((e) => +e.innerText.replace(/[^\\d.]/g, ''))`);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  it('opens the product page, picks 2 and adds them to the cart', async () => {
    await page.type('#shop-q', PRODUCT);
    await page.press(PRODUCT, { within: '.card h2' });
    await page.waitFor(`location.pathname.startsWith('/shop/e2e-lamp')`, 'the product page');
    await page.waitForText('.price', '₹449');
    await page.press('+', { within: '.qty' });
    await page.waitForText('.qty', '2');
    await page.press('Add to cart', { within: '.buy' });
    await page.waitForText('.note', 'Added 2 to your cart.');
    await page.waitForText('mjk-top-bar', 'Cart (2)');
  });

  it('changes the quantity in the cart and removes an item', async () => {
    await page.goto('/cart');
    await page.waitForText('main', PRODUCT);
    await page.click(`[aria-label="One more ${PRODUCT}"]`);
    await page.waitForText('mjk-top-bar', 'Cart (3)');
    await page.click(`[aria-label="One less ${PRODUCT}"]`);
    await page.waitForText('mjk-top-bar', 'Cart (2)');
    await page.click(`[aria-label="Remove ${PRODUCT} from cart"]`);
    await page.waitForText('main', 'Go to the shop');
    assert.doesNotMatch(await page.text('main'), /electronics/i);
  });

  it('checks the new address, then places a cash on delivery order', async () => {
    await buyOne();
    if (!(await page.exists('#a-name'))) await page.press('Add a new address');
    await page.click('form.address button[type=submit]');
    await page.waitFor(`document.querySelector('[aria-labelledby="where-title"] .error')?.innerText.length > 0`, 'an address error');
    await page.type('#a-name', 'E2E Buyer');
    await page.type('#a-phone', '9000000003');
    await page.type('#a-line1', '12 Test Street');
    await page.type('#a-city', 'Chennai');
    await page.type('#a-state', 'Tamil Nadu');
    await page.type('#a-pin', '600001');
    await page.click('form.address button[type=submit]');
    await page.waitForText('[aria-labelledby="where-title"]', '12 Test Street');
    orders.cod = await placeWith('Cash on delivery');
    await page.waitForText('h1', 'Confirmed');
    await page.waitForText('main', 'in cash when the parcel arrives');
  });

  it('lists the order under My orders', async () => {
    await page.goto('/orders');
    await page.waitForText('main', orders.cod);
  });

  it('cancels an order before packing, with a reason', async () => {
    await buyOne();
    const number = await placeWith('Cash on delivery');
    await page.press('Cancel this order');
    await page.type('#cancel-why', 'Ordered by mistake (E2E)');
    await page.press('No, keep it');
    await page.press('Cancel this order');
    await page.press('Yes, cancel the order');
    await page.waitForText('main', 'This order is cancelled');
    await page.waitForText('h1', 'Cancelled');
    orders.cancelled = number;
  });

  it('pays by UPI: sees the UPI ID and amount, then sends the reference', async () => {
    await buyOne();
    orders.upi = await placeWith('UPI');
    await page.waitForText('h1', 'to finish');
    await page.waitForText('.facts', 'UPI ID');
    await page.press('I’ve paid');
    await page.waitForText('form', 'Type the UPI reference number');
    await page.type('#utr', '123456789012');
    await page.press('I’ve paid');
    await page.waitForText('h1', 'checking your payment');
  });

  it('updates their details, and a new password works at the next login', async () => {
    await page.session(who.buyer, '/account');
    await page.waitFor(`!!document.querySelector('#acc-name')`);
    await page.type('#acc-name', 'E2E Buyer Renamed');
    await page.press('Save details');
    await page.waitForText('main', 'Saved.');
    await page.type('#acc-pw', 'fresh-pass-2026');
    await page.type('#acc-pw2', 'fresh-pass-2027');
    await page.press('Set new password');
    await page.waitForText('main', 'The two passwords don’t match');
    await page.type('#acc-pw2', 'fresh-pass-2026');
    await page.press('Set new password');
    await page.waitForText('main', 'Your new password is set');
    await page.login(who.buyer.email, 'fresh-pass-2026');
    await page.waitForPath('/shop');
    await page.waitForText('mjk-top-bar', 'Account');
  });
});

describe('Admin: orders and payments', () => {
  const card = (n) => ({ within: '.order', near: n });

  it('the new order waits under "To pack" with who, where and what to collect', async () => {
    await desk('orders');
    await page.waitForText('.steps', 'To pack');
    await page.waitForText('mjk-orders-desk', orders.cod);
    const text = await page.eval(`[...document.querySelectorAll('.order')].find((o) => o.innerText.includes(${JSON.stringify(orders.cod)})).innerText`);
    assert.match(text, /E2E Buyer/);
    assert.match(text, /9000000003/);
    assert.match(text, /600001/);
    assert.match(text, /Cash on delivery: collect ₹/);
    assert.match(text, new RegExp(PRODUCT));
  });

  it('finds an order by searching its number', async () => {
    await page.type('#order-q', orders.cod);
    await page.press('Search', { within: 'form.search' });
    await page.waitForText('mjk-orders-desk', '1 order matches');
  });

  it('prints the packing slip for the order', async () => {
    const slip = await page.api(`/api/v1/staff/orders/slips/?numbers=${orders.cod}`);
    assert.equal(slip.status, 200);
    assert.match(slip.body, new RegExp(orders.cod));
  });

  it('packs, ships with a typed courier, and delivers', async () => {
    await page.press('Mark packed', card(orders.cod));
    await page.waitForText('mjk-orders-desk .note', 'is packed');
    await page.press('Mark shipped', card(orders.cod));
    await page.press('Mark shipped', card(orders.cod)); // submit with nothing typed
    await page.waitForText('mjk-orders-desk .error', 'courier');
    await page.type(`[id="courier-${orders.cod}"]`, COURIER);
    await page.type(`[id="track-${orders.cod}"]`, 'E2E123456');
    await page.press('Mark shipped', card(orders.cod));
    await page.waitForText('mjk-orders-desk .note', `shipped with ${COURIER}`);
    await page.press('Mark delivered', card(orders.cod));
    await page.waitForText('mjk-orders-desk .note', 'is delivered');
  });

  it('the buyer sees the courier and tracking number', async () => {
    await page.session(who.buyer, `/orders/${orders.cod}`);
    await page.waitForText('h1', 'Delivered');
    await page.waitForText('.parcel', COURIER);
    await page.waitForText('.parcel', 'E2E123456');
  });

  it('rejecting a payment needs a reason, and the buyer sees it', async () => {
    await desk('payments');
    await page.waitForText('mjk-payments-review', orders.upi);
    await page.press('Can’t find it', { within: '.pay', near: orders.upi });
    await page.press('Reject payment', { within: '.pay', near: orders.upi });
    await page.waitForText('mjk-payments-review .error', 'Tell the buyer why');
    await page.type('.pay input[id^=why-]', 'No payment with this reference (E2E)');
    await page.press('Reject payment', { within: '.pay', near: orders.upi });
    await page.waitForText('mjk-payments-review .note', 'asked to send the payment details again');

    await page.session(who.buyer, `/orders/${orders.upi}`);
    await page.waitForText('.warn', 'No payment with this reference (E2E)');
    await page.type('#utr', '999999999999');
    await page.press('I’ve paid');
    await page.waitForText('h1', 'checking your payment');
  });

  it('verifying a payment confirms the order for packing', async () => {
    await desk('payments');
    await page.press('Verify, money received', { within: '.pay', near: orders.upi });
    await page.waitForText('mjk-payments-review .note', `${orders.upi} is paid and confirmed`);
    await desk('orders');
    await page.waitForText('mjk-orders-desk', orders.upi);
  });

  it('cancelling from the orders tab asks first', async () => {
    await page.press('Cancel order', card(orders.upi));
    await page.waitForText('mjk-orders-desk [role=alertdialog]', 'can’t be undone');
    await page.press('No, go back', card(orders.upi));
    await page.press('Cancel order', card(orders.upi));
    await page.press('Yes, cancel the order', card(orders.upi));
    await page.waitForText('mjk-orders-desk .note', 'cancelled and its stock is back');
  });

  it('stock came back for both cancelled orders', async () => {
    // 8 in stock, minus 1 delivered order; the two cancelled ones gave theirs back.
    await desk('products');
    await page.type('#p-q', PRODUCT);
    await page.waitForText('.rows', '7 in stock');
  });

  it('the sales page shows totals, the product and the buyer', async () => {
    await page.session(who.admin, '/admin/sales');
    await page.waitForText('.tiles', 'Revenue');
    await page.waitForText('mjk-product-sales', PRODUCT);
    const row = await page.eval(`[...document.querySelectorAll('mjk-product-sales tbody tr')].find((r) => r.innerText.includes(${JSON.stringify(PRODUCT)})).innerText`);
    assert.match(row, new RegExp(`${SHELF}\\s+1\\s+1\\s+₹449`), `one sold for ₹449: ${row}`);
    await page.type('#buyer-q', `e2e-buyer-${tag}`);
    await page.press('Search', { within: 'mjk-buyers' });
    await page.waitForText('mjk-buyers tbody', 'E2E Buyer Renamed');
  });
});

describe('Phone screens', () => {
  it('no page scrolls sideways at phone width', async () => {
    await page.width(500);
    try {
      const pages = [
        [null, '/'], [null, '/signup'],
        [who.buyer, '/shop'], [who.buyer, '/cart'], [who.buyer, '/orders'], [who.buyer, `/orders/${orders.cod}`], [who.buyer, '/account'],
        [who.admin, '/admin'], [who.admin, '/admin?tab=products'], [who.admin, '/admin?tab=payments'], [who.admin, '/admin/sales'],
      ];
      for (const [account, path] of pages) {
        if (account) await page.session(account, path);
        else await page.loggedOut(path);
        await page.waitFor(`document.querySelector('main')?.innerText.length > 20`, `${path} to fill in`);
        assert.equal(await page.eval('document.documentElement.scrollWidth > innerWidth'), false, `${path} scrolls sideways`);
      }
    } finally {
      await page.width(1280);
    }
  });

  it('on a phone the menu is a tab bar at the bottom, and Log out is under Account', async () => {
    await page.width(390);
    try {
      await page.session(who.buyer, '/shop');
      await page.waitForText('.dock', 'Orders');
      assert.equal(await page.eval(`getComputedStyle(document.querySelector('.bar__links')).display`), 'none', 'top links hidden');
      assert.equal(await page.text('.dock'), 'Shop Orders Cart Account');
      await page.press('Orders', { within: '.dock' });
      await page.waitForPath('/orders');
      await page.press('Account', { within: '.dock' });
      await page.waitForPath('/account');
      await page.press('Log out', { within: 'main' });
      await page.waitForPath('/');

      await page.session(who.admin, '/admin');
      await page.waitForText('.dock', 'Desk');
      assert.equal(await page.text('.dock'), 'Desk Sales Shop Account');
    } finally {
      await page.width(1280);
    }
  });

  it('can be installed as an app: name, colours and icons', async () => {
    const manifest = await page.eval(`fetch('/manifest.webmanifest').then((r) => r.json())`);
    assert.equal(manifest.name, 'MJK Cart');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#ff7a1f');
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((i) => i.sizes === size);
      assert.ok(icon, `${size} icon`);
      assert.equal(await page.eval(`fetch(${JSON.stringify('/' + icon.src)}).then((r) => r.headers.get('content-type'))`), 'image/png');
    }
  });
});
