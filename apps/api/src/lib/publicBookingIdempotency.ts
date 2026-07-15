import { createHash } from 'node:crypto';
import { ValidationError } from './errors.js';
import {
  normalizePublicBookingClientName,
  normalizePublicBookingNotes,
} from './publicBookingInput.js';
import { normalizePublicBookingPhone } from './publicBookingPhone.js';
import { normalizeEmail } from './email.js';

export const PUBLIC_BOOKING_CREATE_OPERATION = 'public-booking-create';

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/u;

export interface PublicBookingFingerprintInput {
  barbershopId: string;
  serviceId: string;
  barberId: string;
  startAt: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  notes?: string | null;
  consentVersion: string;
}

function normalizeUtcInstant(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.endsWith('Z')) {
    throw new ValidationError('startAt must be a UTC timestamp with a Z suffix');
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('startAt must be a valid ISO 8601 datetime');
  }

  return parsed.toISOString();
}

export function validatePublicBookingIdempotencyKey(value: string): string {
  const trimmed = value.trim();

  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) {
    throw new ValidationError(
      'Idempotency-Key must match [A-Za-z0-9_-]{8,128}'
    );
  }

  return trimmed;
}

export function fingerprintPublicBookingRequest(
  input: PublicBookingFingerprintInput
): string {
  const canonicalPayload = {
    barbershopId: input.barbershopId.trim(),
    serviceId: input.serviceId.trim(),
    barberId: input.barberId.trim(),
    startAt: normalizeUtcInstant(input.startAt),
    clientName: normalizePublicBookingClientName(input.clientName),
    clientPhone: normalizePublicBookingPhone(input.clientPhone),
    clientEmail: input.clientEmail?.trim() ? normalizeEmail(input.clientEmail) : null,
    notes: normalizePublicBookingNotes(input.notes),
    consentVersion: input.consentVersion.trim(),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');
}
