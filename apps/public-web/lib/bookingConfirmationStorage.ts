import type { PublicBookingConfirmation } from '@/lib/api/types';

function keyForSlug(slug: string) {
  return `public-booking-confirmation:${slug}`;
}

export function saveBookingConfirmation(
  slug: string,
  confirmation: PublicBookingConfirmation
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(keyForSlug(slug), JSON.stringify(confirmation));
}

export function readBookingConfirmation(slug: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(keyForSlug(slug));

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PublicBookingConfirmation;
  } catch {
    return null;
  }
}
