import React from 'react';
import { render, screen } from '@testing-library/react';
import { PublicBookingConfirmationView } from '@/components/PublicBookingConfirmation';
import { saveBookingConfirmation } from '@/lib/bookingConfirmationStorage';

describe('PublicBookingConfirmationView', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('shows a safe fallback when no confirmation is stored', () => {
    render(<PublicBookingConfirmationView slug="mateo-barber" />);

    expect(
      screen.getByText(/no encontramos la confirmación en este navegador/i)
    ).toBeInTheDocument();
  });

  it('renders the stored confirmation details', async () => {
    saveBookingConfirmation('mateo-barber', {
      bookingReference: 'pb_TEST1234567890',
      barbershopName: 'Mateo Barber',
      serviceName: 'Corte clásico',
      barberName: 'Mateo',
      timezone: 'America/Argentina/Tucuman',
      localDate: '2026-07-20',
      localStartTime: '10:00',
      startAt: '2026-07-20T13:00:00.000Z',
      endAt: '2026-07-20T13:30:00.000Z',
      clientPhoneDisplay: '+543811234567',
      status: 'CONFIRMED',
    });

    render(<PublicBookingConfirmationView slug="mateo-barber" />);

    expect(await screen.findByText('pb_TEST1234567890')).toBeInTheDocument();
    expect(screen.getByText(/corte clásico/i)).toBeInTheDocument();
    expect(screen.getByText(/\+543811234567/)).toBeInTheDocument();
  });
});
