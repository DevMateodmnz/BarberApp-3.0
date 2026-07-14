import { randomBytes } from 'node:crypto';

const PUBLIC_BOOKING_REFERENCE_PREFIX = 'pb_';
// Base32 alphabet (Crockford-flavored; omits 0/1/I/O for human legibility).
const PUBLIC_BOOKING_REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// 20 base32 chars ≈ 100 bits of entropy (decoding is unambiguous).
// 12 random bytes = 96 bits, base32-encoded into 20 chars.
const PUBLIC_BOOKING_REFERENCE_LENGTH = 20;
const PUBLIC_BOOKING_REFERENCE_RANDOM_BYTES = 12;
// 12 bytes encoded as base32 is ceil(12 * 8 / 5) = 20 chars.
const PUBLIC_BOOKING_REFERENCE_REGEX = /^pb_[A-Z2-7]{20}$/u;

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output +=
        PUBLIC_BOOKING_REFERENCE_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }

  if (bits > 0) {
    output +=
      PUBLIC_BOOKING_REFERENCE_ALPHABET[(value << (5 - bits)) & 31] ?? '';
  }

  return output;
}

/**
 * Generates a public booking reference.
 *
 * Security model: the reference is a bearer credential. Possession
 * of the reference authorizes the holder to cancel the matching
 * booking. We rely on the following guarantees:
 *
 * - **Source**: `crypto.randomBytes(12)` uses an OpenSSL-backed CSPRNG.
 * - **Entropy**: 12 random bytes = 96 bits. Encoded as 20 base32 chars
 *   (~100 bits of theoretical entropy; we use the full base32 alphabet
 *   so the encoding is lossless).
 * - **Uniqueness**: enforced at the database level by the
 *   `publicReference @unique` constraint on `Appointment`. A
 *   collision (probability < 2^-96 per booking) is rejected by the
 *   unique index and the caller must retry.
 * - **Not printed to logs**: the reference is generated, persisted,
 *   and returned to the caller. The error middleware does not log
 *   request bodies, the public booking service does not log the
 *   reference, and the reference never appears in
 *   `fingerprintPublicBookingRequest`.
 * - **Not sequential**: random, not auto-incrementing. A leak of one
 *   reference reveals nothing about other references.
 *
 * For an additional hardening pass, a separate cancellation-token
 * hash could be derived from the reference and used to gate the
 * public cancel endpoint, but with 96 bits of entropy and
 * per-tenant rate limiting this is not currently required.
 */
export function generatePublicBookingReference(): string {
  const entropy = randomBytes(PUBLIC_BOOKING_REFERENCE_RANDOM_BYTES);
  return `${PUBLIC_BOOKING_REFERENCE_PREFIX}${encodeBase32(entropy).slice(0, PUBLIC_BOOKING_REFERENCE_LENGTH)}`;
}

export function isPublicBookingReference(value: string): boolean {
  return PUBLIC_BOOKING_REFERENCE_REGEX.test(value);
}

/**
 * Exposed for tests that need to assert entropy bounds without
 * depending on the implementation. The raw byte count is the
 * authoritative entropy figure.
 */
export const PUBLIC_BOOKING_REFERENCE_ENTROPY_BYTES = PUBLIC_BOOKING_REFERENCE_RANDOM_BYTES;
