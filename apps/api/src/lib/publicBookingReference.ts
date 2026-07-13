import { randomBytes } from 'node:crypto';

const PUBLIC_BOOKING_REFERENCE_PREFIX = 'pb_';
const PUBLIC_BOOKING_REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PUBLIC_BOOKING_REFERENCE_LENGTH = 16;
const PUBLIC_BOOKING_REFERENCE_REGEX = /^pb_[A-Z2-7]{16}$/u;

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

export function generatePublicBookingReference(): string {
  const entropy = randomBytes(10);
  return `${PUBLIC_BOOKING_REFERENCE_PREFIX}${encodeBase32(entropy).slice(0, PUBLIC_BOOKING_REFERENCE_LENGTH)}`;
}

export function isPublicBookingReference(value: string): boolean {
  return PUBLIC_BOOKING_REFERENCE_REGEX.test(value);
}
