/**
 * Formatting helpers for BarberApp mobile
 *
 * All money formatting uses integer cents — no floating point.
 * Dates use UTC to ensure deterministic behavior in tests.
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

  // Parts are in reverse order (least significant first)
  // First part is as-is; subsequent parts are zero-padded to 3 digits
  const formatted = parts
    .reverse()
    .map((part, index) => (index === 0 ? part : part.padStart(3, '0')))
    .join('.');

  return `$${formatted}`;
}

/**
 * Returns a date string in YYYY-MM-DD format.
 *
 * Uses UTC to ensure deterministic behavior regardless of timezone.
 * If no Date is provided, returns the current UTC date.
 *
 * @param date - Optional Date object. Defaults to current date.
 * @returns String in YYYY-MM-DD format
 *
 * @example
 * getTodayDateString()                                  // "2026-06-06" (today)
 * getTodayDateString(new Date("2026-01-15T12:00:00Z")) // "2026-01-15"
 * getTodayDateString(new Date("2024-02-29T12:00:00Z")) // "2024-02-29"
 */
export function getTodayDateString(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}