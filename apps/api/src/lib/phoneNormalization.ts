/**
 * Phone normalization for storage and lookup.
 *
 * Public booking already enforces E.164 at the input layer (see
 * {@link ./publicBookingPhone.ts}). Staff-created appointments accept
 * free-form phone input, so we must not throw on non-conforming
 * values. The lookup endpoint requires an E.164 input, so the only
 * caller that actually rejects bad input is the public write path.
 */
const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/u;

/**
 * Returns the E.164-canonical form of `value` if it already matches,
 * otherwise null. Trims whitespace. Never throws.
 */
export function tryNormalizeClientPhoneE164(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return E164_PHONE_REGEX.test(trimmed) ? trimmed : null;
}
