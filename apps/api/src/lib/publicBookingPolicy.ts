import { ValidationError } from './errors.js';
import { APPOINTMENT_SLOT_INTERVAL_MINUTES } from './appointmentScheduling.js';

export interface PublicBookingPolicy {
  minimumNoticeMinutes: number;
  maximumBookingHorizonDays: number;
  slotIntervalMinutes: number;
}

export const DEFAULT_PUBLIC_BOOKING_POLICY: Readonly<PublicBookingPolicy> =
  Object.freeze({
    minimumNoticeMinutes: 60,
    maximumBookingHorizonDays: 30,
    slotIntervalMinutes: APPOINTMENT_SLOT_INTERVAL_MINUTES,
  });

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${label} must be a positive integer`);
  }
}

export function validatePublicBookingPolicy(
  policy: PublicBookingPolicy
): PublicBookingPolicy {
  assertPositiveInteger(policy.minimumNoticeMinutes, 'Public minimum notice');
  assertPositiveInteger(
    policy.maximumBookingHorizonDays,
    'Public booking horizon'
  );
  assertPositiveInteger(policy.slotIntervalMinutes, 'Public slot interval');

  if (60 % policy.slotIntervalMinutes !== 0) {
    throw new ValidationError(
      'Public slot interval must divide evenly into one hour'
    );
  }

  return policy;
}

export function createPublicBookingPolicy(
  overrides: Partial<PublicBookingPolicy> = {}
): PublicBookingPolicy {
  return validatePublicBookingPolicy({
    ...DEFAULT_PUBLIC_BOOKING_POLICY,
    ...overrides,
  });
}

export function getPublicBookingPolicy(): Readonly<PublicBookingPolicy> {
  return DEFAULT_PUBLIC_BOOKING_POLICY;
}
