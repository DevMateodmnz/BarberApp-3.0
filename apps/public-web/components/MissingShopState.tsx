import React from 'react';
import { BookingPageNotice } from './BookingPageNotice';

export function MissingShopState() {
  return (
    <BookingPageNotice
      title="Esta barbería no está disponible"
      message="Verificá el enlace o contactá a la barbería para recibir ayuda."
    />
  );
}
