'use client';

import { BookingPageNotice } from '@/components/BookingPageNotice';

export default function PublicBookingErrorPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '1rem',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: '32rem' }}>
        <BookingPageNotice
          title="No pudimos abrir esta agenda"
          message="Intentá recargar la página o pedile a la barbería un nuevo enlace."
        />
      </div>
    </main>
  );
}
