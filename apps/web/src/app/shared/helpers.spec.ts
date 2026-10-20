import { describe, expect, it } from 'vitest';

import { money } from './money';
import { postalZone } from './pincode';

describe('money', () => {
  it('drops paise on whole rupees and groups the Indian way', () => {
    expect(money('1299.00')).toBe('₹1,299');
    expect(money(125000)).toBe('₹1,25,000');
    expect(money('99.50')).toBe('₹99.5');
    expect(money(null)).toBe('');
  });
});

describe('postalZone', () => {
  it('names the region from the first digit of a valid pincode', () => {
    expect(postalZone('600001')).toBe('Tamil Nadu and Kerala');
    expect(postalZone('110001')).toContain('Delhi');
    expect(postalZone('060001')).toBeNull();
    expect(postalZone('6000')).toBeNull();
  });
});
