import { ValidationError } from './errors.js';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/u;

export function normalizePublicBookingPhone(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new ValidationError('clientPhone is required');
  }

  if (!E164_PHONE_REGEX.test(trimmed)) {
    throw new ValidationError(
      'clientPhone must be a canonical E.164 phone number'
    );
  }

  return trimmed;
}
