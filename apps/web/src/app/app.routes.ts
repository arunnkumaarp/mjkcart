import { Routes } from '@angular/router';

import { adminOnly, buyersOnly, loggedIn, loggedOut, staffOnly } from './core/guards';
import { Admin } from './pages/admin/admin';
import { CartPage } from './pages/cart/cart-page';
import { Checkout } from './pages/checkout/checkout';
import { Account } from './pages/account/account';
import { ProductPage } from './pages/product/product-page';
import { Gallery } from './pages/gallery/gallery';
import { Login } from './pages/login/login';
import { OrderPage } from './pages/orders/order-page';
import { OrdersPage } from './pages/orders/orders-page';
import { Sales } from './pages/sales/sales';
import { Signup } from './pages/signup/signup';

export const routes: Routes = [
  // One login for buyers and the shop team; the role sends each to their own home.
  { path: '', component: Login, canActivate: [loggedOut], title: 'Log in · MJK Cart' },
  { path: 'signup', component: Signup, canActivate: [loggedOut], title: 'Create account · MJK Cart' },
  { path: 'shop', component: Gallery, canActivate: [loggedIn], title: 'Shop · MJK Cart' },
  { path: 'account', component: Account, canActivate: [loggedIn], title: 'Your account · MJK Cart' },
  { path: 'shop/:slug', component: ProductPage, canActivate: [loggedIn], title: 'Product · MJK Cart' },
  { path: 'cart', component: CartPage, canActivate: [buyersOnly], title: 'Your cart · MJK Cart' },
  { path: 'checkout', component: Checkout, canActivate: [buyersOnly], title: 'Checkout · MJK Cart' },
  { path: 'orders', component: OrdersPage, canActivate: [buyersOnly], title: 'Your orders · MJK Cart' },
  { path: 'orders/:number', component: OrderPage, canActivate: [buyersOnly], title: 'Order · MJK Cart' },
  { path: 'admin', component: Admin, canActivate: [staffOnly], title: 'Admin · MJK Cart' },
  { path: 'admin/sales', component: Sales, canActivate: [adminOnly], title: 'Sales · MJK Cart' },
  // Unknown addresses land on the shop.
  { path: '**', redirectTo: 'shop' },
];
