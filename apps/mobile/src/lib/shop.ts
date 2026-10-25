import type { Shop } from '@mjkcart/api';
import { useEffect, useState } from 'react';

import { api } from './api';

let cached: Shop | null = null;

/** The shop's name, tagline and UPI details, fetched once and shared by every screen. */
export function useShop() {
  const [shop, setShop] = useState<Shop | null>(cached);
  useEffect(() => {
    if (cached) return;
    void api.GET('/api/v1/shop/').then(({ data }) => {
      if (data) {
        cached = data;
        setShop(data);
      }
    }).catch(() => undefined);
  }, []);
  return shop;
}
