const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "₹1,299" or "₹1,299.50": whole rupees drop their paise. Same as the website. */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `₹${rupees.format(Number(value))}`;
}

/** The first message the server sent back, e.g. {"email": ["There is already an account…"]} or {"detail": "…"}. */
export function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const value of Object.values(error)) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}

export const OFFLINE = 'We can’t reach the shop right now. Check your internet and try again.';

/** How much is taken off the MRP, as a whole percent; 0 when there's no discount. */
export function percentOff(price: string, mrp?: string | null) {
  const p = Number(price);
  const m = Number(mrp);
  return m > p ? Math.round((1 - p / m) * 100) : 0;
}
