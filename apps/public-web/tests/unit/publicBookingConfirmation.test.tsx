import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PublicBookingConfirmationView } from '@/components/PublicBookingConfirmation';
import { readBookingConfirmation, saveBookingConfirmation } from '@/lib/bookingConfirmationStorage';

describe('PublicBookingConfirmationView', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows a safe fallback when no confirmation is stored', () => {
    render(<PublicBookingConfirmationView slug="mateo-barber" />);

    expect(
      screen.getByText(/no encontramos la reserva en este navegador/i)
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
      status: 'CONFIRMED',
    });

    render(<PublicBookingConfirmationView slug="mateo-barber" />);

    expect(await screen.findByText('pb_TEST1234567890')).toBeInTheDocument();
    expect(screen.getByText(/corte clásico/i)).toBeInTheDocument();
    expect(screen.getByText('¡Turno confirmado!')).toBeInTheDocument();
  });

  it('refreshes the confirmation from the public reference when one is provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          bookingReference: 'pb_TEST1234567890',
          barbershopName: 'Mateo Barber',
          serviceName: 'Corte premium',
          barberName: 'María',
          timezone: 'America/Argentina/Tucuman',
          localDate: '2026-07-21',
          localStartTime: '11:30',
          startAt: '2026-07-21T14:30:00.000Z',
          endAt: '2026-07-21T15:15:00.000Z',
          clientPhoneDisplay: '+543811234567',
          status: 'CONFIRMED',
        },
      }),
    } as Response);

    render(
      <PublicBookingConfirmationView
        slug="mateo-barber"
        referenceFromQuery="pb_TEST1234567890"
      />
    );

    expect(await screen.findByText('pb_TEST1234567890')).toBeInTheDocument();
    expect(await screen.findByText(/corte premium/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(readBookingConfirmation('mateo-barber')?.serviceName).toBe('Corte premium');
    });
  });

  it('shows refund-review copy after cancelling a paid booking', async () => {
    const user = userEvent.setup();
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
      appointmentStatus: 'CONFIRMED',
      paymentStatus: 'APPROVED',
      amountCents: 1500,
      remainingAmountCents: 1700,
      currency: 'ARS',
      canCancel: true,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: readBookingConfirmation('mateo-barber'),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            appointmentStatus: 'CONFIRMED',
            paymentStatus: 'APPROVED',
            amount: 1500,
            currency: 'ARS',
            expiresAt: null,
            canRetry: false,
            canCancel: true,
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'appt_1',
            publicReference: 'pb_TEST1234567890',
            status: 'CANCELLED',
            cancelledAt: '2026-07-19T12:00:00.000Z',
            cancellationSource: 'PUBLIC_BOOKING',
            cancelReason: 'No puedo asistir',
            paymentStatus: 'REVIEW_REQUIRED',
            refundReviewRequired: true,
          },
        }),
      } as Response);

    render(<PublicBookingConfirmationView slug="mateo-barber" />);

    await user.click(await screen.findByRole('button', { name: /cancelar reserva/i }));
    await user.type(screen.getByLabelText(/motivo/i), 'No puedo asistir');
    await user.click(screen.getByRole('button', { name: /sí, cancelar reserva/i }));

    expect(await screen.findByText(/la reserva fue cancelada/i)).toBeInTheDocument();
    expect(
      screen.getByText(/la cancelación no procesa automáticamente la devolución de la seña/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/motivo registrado/i)).toBeInTheDocument();
    expect(screen.getByText('No puedo asistir')).toBeInTheDocument();
  });
});
