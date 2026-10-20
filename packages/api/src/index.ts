import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export type { components, paths };
export type Product = components["schemas"]["Product"];
export type Variant = components["schemas"]["Variant"];
export type ProductImage = components["schemas"]["ProductImage"];
export type Category = components["schemas"]["Category"];
export type Cart = components["schemas"]["Cart"];
export type CartItem = components["schemas"]["CartItem"];
export type Order = components["schemas"]["Order"];
export type StaffOrder = components["schemas"]["StaffOrder"];
export type LatestPayment = components["schemas"]["LatestPayment"];
export type StaffPayment = components["schemas"]["StaffPayment"];
export type Courier = components["schemas"]["Courier"];
export type Coupon = components["schemas"]["Coupon"];
export type ReportSummary = components["schemas"]["Summary"];
export type ReportDay = components["schemas"]["Day"];
export type TopProduct = components["schemas"]["TopProduct"];
export type LowStock = components["schemas"]["LowStock"];
export type TeamMember = components["schemas"]["Member"];
export type ShopSettings = components["schemas"]["ShopSettings"];
export type Quote = components["schemas"]["Quote"];
export type User = components["schemas"]["User"];
export type Address = components["schemas"]["Address"];
export type Shop = components["schemas"]["PublicShop"];

export interface ApiOptions {
  /** e.g. http://localhost:8001 in development. */
  baseUrl: string;
  /** Returns the current JWT access token, if logged in. */
  getToken?: () => string | null | undefined;
}

/** One client for web and mobile; each app supplies its own token storage. */
export function createApi({ baseUrl, getToken }: ApiOptions) {
  const client = createClient<paths>({ baseUrl });
  const auth: Middleware = {
    onRequest({ request }) {
      const token = getToken?.();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

export type Api = ReturnType<typeof createApi>;
