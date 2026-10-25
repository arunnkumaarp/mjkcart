# mjkcart

MJK Cart: online shop for India with a Django REST API, Angular web app and React Native mobile app. Cash on delivery and UPI QR payments, DHL / Professional Couriers shipping.

The shop sells whatever its shelves say — electronics today, jewellery or groceries tomorrow. Shelf names, the shop name and tagline are settings, not code.

## What's inside

| Part | Where | What it does |
|---|---|---|
| API | `backend/` | Django REST: accounts (password login, signup), catalog, cart, checkout, orders, UPI payment checks, couriers, sales reports |
| Web app | `apps/web/` | Angular. Buyers shop, pay and track orders; the shop team runs the admin desk. Installable on phones (PWA) |
| Mobile app | `apps/mobile/` | Expo / React Native buyer app for Android and iOS |
| API client | `packages/api/` | Typed client generated from the API's OpenAPI schema, shared by web and mobile |

**Buyers:** sign up, shop by shelf, search and sort, product pages, cart, checkout with UPI or cash on delivery, pay by scanning the shop's QR (or open a UPI app), send the payment reference, track the parcel, cancel before packing, manage their account.

**Shop team (web admin desk):** Orders tab (pack → ship with courier and tracking → deliver, print packing slips, cancel), Products (add, edit, hide, stock badges), Shelves, Payments (verify or reject UPI payments, set the UPI ID and QR), Shop settings, and a Sales page for admins (revenue, sales by category and product, buyers).

## Run it

```bash
cp backend/.env.example backend/.env      # then fill it in
docker compose up -d                      # Postgres on :5433, API on :8001
docker compose exec backend python manage.py migrate

cd apps/web && npm install && npm start   # web on http://localhost:4200

cd apps/mobile && npm install
npx expo start                            # scan with Expo Go, or:
npm run android                           # build and install on an emulator / phone
```

On the Android emulator, `adb reverse tcp:8001 tcp:8001` lets the app reach the API on your computer. For a real server set `EXPO_PUBLIC_API_URL`.

After changing the API, regenerate the shared client: `cd packages/api && npm run build`.

## Tests

```bash
docker compose exec backend pytest        # API
cd apps/web && npm test                   # web unit tests
cd apps/web && npm run e2e                # browser tests: every buyer and admin scenario in headless Chrome
cd apps/mobile && npm run typecheck
```

The browser tests need the API and web app running. They make their own `e2e-…` accounts and `E2E …` products and delete them afterwards.

## Screenshots

### Web

| Login | Shop | Product |
|---|---|---|
| ![Login](docs/screenshots/web/01-login.png) | ![Shop](docs/screenshots/web/03-shop.png) | ![Product](docs/screenshots/web/04-product.png) |

| Cart | Checkout | UPI payment |
|---|---|---|
| ![Cart](docs/screenshots/web/05-cart.png) | ![Checkout](docs/screenshots/web/05b-checkout.png) | ![UPI payment](docs/screenshots/web/07-upi-payment.png) |

| Order tracking | My orders | Account |
|---|---|---|
| ![Order tracking](docs/screenshots/web/06-order-tracking.png) | ![My orders](docs/screenshots/web/08-my-orders.png) | ![Account](docs/screenshots/web/09-account.png) |

| Admin: orders | Admin: products | Admin: payments |
|---|---|---|
| ![Admin orders](docs/screenshots/web/11-admin-orders.png) | ![Admin products](docs/screenshots/web/12-admin-products.png) | ![Admin payments](docs/screenshots/web/13-admin-payments.png) |

| Sales | Signup | On a phone |
|---|---|---|
| ![Sales](docs/screenshots/web/14-admin-sales.png) | ![Signup](docs/screenshots/web/02-signup.png) | ![Shop on a phone](docs/screenshots/web/10-shop-phone.png) ![Admin on a phone](docs/screenshots/web/15-admin-phone.png) |

### Mobile (Android)

| Splash | Login | Shop | Product |
|---|---|---|---|
| ![Splash](docs/screenshots/mobile/00-splash.png) | ![Login](docs/screenshots/mobile/01-login.png) | ![Shop](docs/screenshots/mobile/03-shop.png) | ![Product](docs/screenshots/mobile/04-product.png) |

| Cart | Checkout | UPI payment | Order tracking |
|---|---|---|---|
| ![Cart](docs/screenshots/mobile/05-cart.png) | ![Checkout](docs/screenshots/mobile/06-checkout.png) | ![UPI payment](docs/screenshots/mobile/09-upi-payment.png) | ![Order tracking](docs/screenshots/mobile/07-order-tracking.png) |

| Orders | Account | Signup | App icon |
|---|---|---|---|
| ![Orders](docs/screenshots/mobile/08-orders.png) | ![Account](docs/screenshots/mobile/10-account.png) | ![Signup](docs/screenshots/mobile/02-signup.png) | ![Home screen](docs/screenshots/mobile/11-home-screen-icon.png) |

The UPI screenshots show a sample QR code (`mjkcart.demo@sample`), not a real payment address.
