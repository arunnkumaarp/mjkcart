import type { Cart } from '@mjkcart/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from './api';
import { OFFLINE } from './format';
import { isStaff, useSession } from './session';

interface CartState {
  cart: Cart | null;
  count: number;
  loading: boolean;
  /** The variant being added or the cart line being changed, so its button can say so. */
  working: number | null;
  load(): Promise<void>;
  /** Each returns an error message to show, or '' when it worked. */
  add(variant: number, quantity?: number): Promise<string>;
  setQuantity(item: number, quantity: number): Promise<string>;
  remove(item: number): Promise<string>;
  clear(): void;
}

const Ctx = createContext<CartState | null>(null);

/** The buyer's cart, kept on the server so it is the same on the website and the app. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.GET('/api/v1/cart/');
      if (data) setCart(data);
    } catch {
      /* the cart screen offers Try again */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && !isStaff(user)) void load();
    else setCart(null);
  }, [user, load]);

  const change = useCallback(async (key: number, call: () => Promise<{ data?: Cart; error?: unknown }>) => {
    setWorking(key);
    try {
      const { data, error } = await call();
      if (data) setCart(data);
      return data ? '' : quantityError(error);
    } catch {
      return OFFLINE;
    } finally {
      setWorking(null);
    }
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      count: cart?.item_count ?? 0,
      loading,
      working,
      load,
      add: (variant, quantity = 1) => change(variant, () => api.POST('/api/v1/cart/items/', { body: { variant, quantity } })),
      setQuantity: (item, quantity) =>
        change(item, () => api.PATCH('/api/v1/cart/items/{id}/', { params: { path: { id: item } }, body: { quantity } })),
      remove: (item) => change(item, () => api.DELETE('/api/v1/cart/items/{id}/', { params: { path: { id: item } } })),
      clear: () => setCart(null),
    }),
    [cart, loading, working, load, change],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart needs CartProvider');
  return ctx;
}

function quantityError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { quantity?: unknown; detail?: unknown };
    if (Array.isArray(e.quantity) && typeof e.quantity[0] === 'string') return e.quantity[0];
    if (typeof e.detail === 'string') return e.detail;
  }
  return 'That didn’t work. Please try again.';
}
