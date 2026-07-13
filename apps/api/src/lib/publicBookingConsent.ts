export interface PublicBookingConsent {
  version: string;
  text: string;
}

export const CURRENT_PUBLIC_BOOKING_CONSENT_VERSION = 'public-booking-v1';

const CURRENT_PUBLIC_BOOKING_CONSENT: Readonly<PublicBookingConsent> =
  Object.freeze({
    version: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
    text: 'Acepto compartir mis datos y reservar este turno para que la barbería gestione esta reserva y el contacto relacionado con el turno.',
  });

export function getPublicBookingConsent(): Readonly<PublicBookingConsent> {
  return CURRENT_PUBLIC_BOOKING_CONSENT;
}
