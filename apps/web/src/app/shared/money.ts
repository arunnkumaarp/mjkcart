const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "₹1,299" or "₹1,299.50": whole rupees drop their paise. */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `₹${rupees.format(Number(value))}`;
}
