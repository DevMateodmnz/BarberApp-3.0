import type { PublicCreateAppointmentPayload } from '@/lib/api/types';

export interface PendingPublicBookingAttempt {
  idempotencyKey: string;
  payload: PublicCreateAppointmentPayload;
}

function keyForSlug(slug: string) {
  return `public-booking-pending-attempt:${slug}`;
}

export function readPendingBookingAttempt(
  slug: string
): PendingPublicBookingAttempt | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(keyForSlug(slug));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PendingPublicBookingAttempt;
  } catch {
    return null;
  }
}

export function savePendingBookingAttempt(
  slug: string,
  attempt: PendingPublicBookingAttempt
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(keyForSlug(slug), JSON.stringify(attempt));
}

export function clearPendingBookingAttempt(slug: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(keyForSlug(slug));
}
