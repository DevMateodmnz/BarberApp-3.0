/**
 * Formatting helpers for BarberApp mobile
 *
 * All money formatting uses integer cents — no floating point.
 * Date formatting uses LOCAL calendar fields so that "today"
 * matches the device's local day, not UTC.
 */

/**
 * Formats a price in cents as an Argentine-style currency string.
 *
 * Uses dot as thousands separator (e.g. "$2.500" for 2500 cents).
 * No decimals — cents are always whole numbers in our model.
 *
 * @param cents - Non-negative integer price in cents
 * @returns Formatted string like "$2.500" or "$150.000"
 * @throws Error if cents is negative or not an integer
 *
 * @example
 * formatCents(0)      // "$0"
 * formatCents(5)      // "$5"
 * formatCents(2500)    // "$2.500"
 * formatCents(150000)  // "$150.000"
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error('cents must be an integer');
  }
  if (cents < 0) {
    throw new Error('cents must be non-negative');
  }

  const parts: string[] = [];
  let remaining = cents;

  do {
    parts.push(String(remaining % 1000));
    remaining = Math.floor(remaining / 1000);
  } while (remaining > 0);

  const formatted = parts
    .reverse()
    .map((part, index) => (index === 0 ? part : part.padStart(3, '0')))
    .join('.');

  return `$${formatted}`;
}

/**
 * Parses a user-entered currency amount into integer cents.
 *
 * Accepted forms:
 * - whole amounts: "5000"
 * - dot decimals: "5000.50"
 * - comma decimals: "5000,50"
 * - optional surrounding whitespace
 *
 * Rejected forms:
 * - empty strings
 * - negatives
 * - more than two decimal places
 * - mixed/non-numeric content
 *
 * This helper uses string parsing and integer math only.
 */
export function parseCurrencyInputToCents(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (normalized.length === 0) {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const wholePart = match[1]!;
  const decimalPart = (match[2] ?? '').padEnd(2, '0');

  const wholeCents = Number(wholePart) * 100;
  const decimalCents = Number(decimalPart || '0');

  if (!Number.isSafeInteger(wholeCents) || !Number.isSafeInteger(decimalCents)) {
    return null;
  }

  const cents = wholeCents + decimalCents;
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return null;
  }

  return cents;
}

/**
 * Formats integer cents for editable input using a human-friendly decimal amount.
 *
 * Examples:
 * - 500000 -> "5000"
 * - 500050 -> "5000.50"
 * - 99 -> "0.99"
 */
export function formatCentsForInput(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error('cents must be an integer');
  }
  if (cents < 0) {
    throw new Error('cents must be non-negative');
  }

  const whole = Math.floor(cents / 100);
  const remainder = cents % 100;

  if (remainder === 0) {
    return String(whole);
  }

  return `${whole}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Formats backend payment method values for display in daily summaries.
 *
 * Backend values are stored as enum-like strings, but older/missing records may
 * have null, undefined, or unexpected values. Unknown inputs intentionally fall
 * back to a human-friendly "Unspecified" label instead of leaking raw values.
 *
 * @param paymentMethod - Backend payment method value
 * @returns Human-readable English label
 */
export function formatPaymentMethodLabel(paymentMethod: unknown): string {
  if (typeof paymentMethod !== 'string') {
    return 'Unspecified';
  }

  switch (paymentMethod.trim().toUpperCase()) {
    case 'CASH':
      return 'Cash';
    case 'CARD':
      return 'Card';
    case 'TRANSFER':
      return 'Transfer';
    case 'OTHER':
      return 'Other';
    default:
      return 'Unspecified';
  }
}

export function getTodayDateString(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(date: string, amount: number): string {
  const parts = date.split('-');
  const y = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  const d = parseInt(parts[2]!, 10);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + amount);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTodayDateString(date: string): boolean {
  return date === getTodayDateString();
}
