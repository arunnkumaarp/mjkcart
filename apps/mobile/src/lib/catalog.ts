import type { Product } from '@mjkcart/api';

/** The option a shopper gets from the list: the first one in stock. */
export function pick(p: Product) {
  return p.variants.find((v) => v.is_active && (v.stock ?? 0) > 0);
}
