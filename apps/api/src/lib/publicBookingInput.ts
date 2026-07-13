import { ValidationError } from './errors.js';

export const PUBLIC_BOOKING_CLIENT_NAME_MAX_LENGTH = 120;
export const PUBLIC_BOOKING_NOTES_MAX_LENGTH = 500;

const CONTROL_CHARACTER_REGEX = /\p{Cc}/u;

function assertNoControlCharacters(value: string, label: string): void {
  if (CONTROL_CHARACTER_REGEX.test(value)) {
    throw new ValidationError(`${label} contains unsupported characters`);
  }
}

export function normalizePublicBookingClientName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new ValidationError('clientName is required');
  }

  if (trimmed.length > PUBLIC_BOOKING_CLIENT_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `clientName must be at most ${PUBLIC_BOOKING_CLIENT_NAME_MAX_LENGTH} characters`
    );
  }

  assertNoControlCharacters(trimmed, 'clientName');

  return trimmed;
}

export function normalizePublicBookingNotes(
  value?: string | null
): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > PUBLIC_BOOKING_NOTES_MAX_LENGTH) {
    throw new ValidationError(
      `notes must be at most ${PUBLIC_BOOKING_NOTES_MAX_LENGTH} characters`
    );
  }

  assertNoControlCharacters(trimmed, 'notes');

  return trimmed;
}
