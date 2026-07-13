'use client';

import React, { useEffect, useState } from 'react';
import type { PublicBookingConfirmation } from '@/lib/api/types';
import { BookingPageNotice } from '@/components/BookingPageNotice';
import { readBookingConfirmation } from '@/lib/bookingConfirmationStorage';

function formatDate(confirmation: PublicBookingConfirmation) {
  const middayUtc = new Date(`${confirmation.localDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: confirmation.timezone,
    dateStyle: 'long',
  }).format(middayUtc);
}

export function PublicBookingConfirmationView({ slug }: { slug: string }) {
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(
    null
  );

  useEffect(() => {
    setConfirmation(readBookingConfirmation(slug));
  }, [slug]);

  if (!confirmation) {
    return (
      <BookingPageNotice
        title="No encontramos la confirmación en este navegador"
        message="Si ya reservaste, contactá a la barbería para validar tu turno con tu nombre y teléfono."
      />
    );
  }

  return (
    <section
      aria-labelledby="booking-confirmation-title"
      style={{
        width: '100%',
        maxWidth: '42rem',
        padding: '1.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '1.5rem',
        boxShadow: 'var(--shadow)',
      }}
    >
      <p style={{ marginTop: 0, color: 'var(--success)', fontWeight: 700 }}>
        ¡Reserva confirmada!
      </p>
      <h1 id="booking-confirmation-title" style={{ marginTop: 0 }}>
        {confirmation.barbershopName}
      </h1>
      <dl
        style={{
          display: 'grid',
          gap: '0.75rem',
          margin: 0,
        }}
      >
        <div>
          <dt style={{ fontWeight: 700 }}>Referencia</dt>
          <dd style={{ margin: 0 }}>{confirmation.bookingReference}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Servicio</dt>
          <dd style={{ margin: 0 }}>{confirmation.serviceName}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Barbero</dt>
          <dd style={{ margin: 0 }}>{confirmation.barberName}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Fecha y hora</dt>
          <dd style={{ margin: 0 }}>
            {formatDate(confirmation)} a las {confirmation.localStartTime}
          </dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Teléfono</dt>
          <dd style={{ margin: 0 }}>{confirmation.clientPhoneDisplay}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Estado</dt>
          <dd style={{ margin: 0 }}>{confirmation.status}</dd>
        </div>
      </dl>
    </section>
  );
}
