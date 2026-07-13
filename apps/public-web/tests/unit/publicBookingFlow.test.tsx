import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicBookingFlow } from '@/components/PublicBookingFlow';
import { BrowserApiError } from '@/lib/api/browser';

describe('PublicBookingFlow', () => {
  const shop = {
    slug: 'mateo-barber',
    name: 'Mateo Barber',
    timezone: 'America/Argentina/Tucuman',
  };

  const services = [
    {
      serviceId: 'svc_1',
      name: 'Corte clásico',
      description: 'Incluye lavado',
      durationMinutes: 30,
      priceCents: 3200,
      currency: 'ARS',
    },
    {
      serviceId: 'svc_2',
      name: 'Barba',
      description: null,
      durationMinutes: 20,
      priceCents: 2200,
      currency: 'ARS',
    },
  ];

  const bookingConfig = {
    consent: {
      version: 'public-booking-v1',
      text: 'Acepto compartir mis datos y reservar este turno.',
    },
    policy: {
      minimumNoticeMinutes: 60,
      maximumBookingHorizonDays: 30,
      slotIntervalMinutes: 30,
    },
  };

  it('lets the customer pick service, barber, date, and slot', async () => {
    const user = userEvent.setup();
    const loadBarbers = vi.fn().mockResolvedValue([
      { barberId: 'barber_1', displayName: 'Mateo' },
      { barberId: 'barber_2', displayName: 'Lucas' },
    ]);
    const loadAvailability = vi.fn().mockResolvedValue({
      slug: shop.slug,
      serviceId: 'svc_1',
      barberId: 'barber_1',
      localDate: '2026-07-20',
      timezone: shop.timezone,
      slotIntervalMinutes: 30,
      serviceDurationMinutes: 30,
      slots: [
        {
          startAt: '2026-07-20T13:00:00.000Z',
          endAt: '2026-07-20T13:30:00.000Z',
        },
        {
          startAt: '2026-07-20T13:30:00.000Z',
          endAt: '2026-07-20T14:00:00.000Z',
        },
      ],
    });

    render(
      <PublicBookingFlow
        shop={shop}
        services={services}
        bookingConfig={bookingConfig}
        loadBarbers={loadBarbers}
        loadAvailability={loadAvailability}
      />
    );

    expect(
      screen.getByRole('heading', { name: /mateo barber/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /corte clásico/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /corte clásico/i }));

    await waitFor(() => {
      expect(loadBarbers).toHaveBeenCalledWith('svc_1');
    });

    await user.click(screen.getByRole('radio', { name: /mateo/i }));
    await user.type(
      screen.getByLabelText(/fecha de reserva/i),
      '2026-07-20'
    );
    await user.click(
      screen.getByRole('button', { name: /ver horarios disponibles/i })
    );

    await waitFor(() => {
      expect(loadAvailability).toHaveBeenCalledWith({
        barberId: 'barber_1',
        localDate: '2026-07-20',
        serviceId: 'svc_1',
      });
    });

    expect(
      await screen.findByRole('button', { name: /10:00/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /10:00/i }));

    expect(screen.getByText(/turno seleccionado/i)).toBeInTheDocument();
    expect(screen.getByText(/20 de julio de 2026/i)).toBeInTheDocument();
  });

  it('shows an empty-state message when the selected service has no barbers', async () => {
    const user = userEvent.setup();
    const loadBarbers = vi.fn().mockResolvedValue([]);

    render(
      <PublicBookingFlow
        shop={shop}
        services={services}
        bookingConfig={bookingConfig}
        loadBarbers={loadBarbers}
        loadAvailability={vi.fn()}
      />
    );

    await user.click(screen.getByRole('radio', { name: /barba/i }));

    expect(
      await screen.findByText(/no hay barberos disponibles para este servicio/i)
    ).toBeInTheDocument();
  });

  it('shows the booking form after slot selection and submits the booking with consent', async () => {
    const user = userEvent.setup();
    const submitBooking = vi.fn().mockResolvedValue({
      bookingReference: 'pb_TEST1234567890',
      barbershopName: 'Mateo Barber',
      serviceName: 'Corte clásico',
      barberName: 'Mateo',
      timezone: shop.timezone,
      localDate: '2026-07-20',
      localStartTime: '10:00',
      startAt: '2026-07-20T13:00:00.000Z',
      endAt: '2026-07-20T13:30:00.000Z',
      clientPhoneDisplay: '+543811234567',
      status: 'CONFIRMED',
    });
    const onBookingConfirmed = vi.fn();

    render(
      <PublicBookingFlow
        shop={shop}
        services={services}
        bookingConfig={bookingConfig}
        loadBarbers={vi.fn().mockResolvedValue([
          { barberId: 'barber_1', displayName: 'Mateo' },
        ])}
        loadAvailability={vi.fn().mockResolvedValue({
          slug: shop.slug,
          serviceId: 'svc_1',
          barberId: 'barber_1',
          localDate: '2026-07-20',
          timezone: shop.timezone,
          slotIntervalMinutes: 30,
          serviceDurationMinutes: 30,
          slots: [
            {
              startAt: '2026-07-20T13:00:00.000Z',
              endAt: '2026-07-20T13:30:00.000Z',
            },
          ],
        })}
        submitBooking={submitBooking}
        onBookingConfirmed={onBookingConfirmed}
      />
    );

    await user.click(screen.getByRole('radio', { name: /corte clásico/i }));
    await user.click(await screen.findByRole('radio', { name: /mateo/i }));
    await user.type(
      screen.getByLabelText(/fecha de reserva/i),
      '2026-07-20'
    );
    await user.click(
      screen.getByRole('button', { name: /ver horarios disponibles/i })
    );
    await user.click(await screen.findByRole('button', { name: /10:00/i }));

    await user.type(screen.getByLabelText(/nombre y apellido/i), 'Mateo');
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234567');
    const consentCheckbox = screen.getByRole('checkbox', {
      name: /acepto compartir mis datos/i,
    });
    await user.click(consentCheckbox);
    await waitFor(() => {
      expect(consentCheckbox).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: /reservar turno/i }));

    await waitFor(() => {
      expect(submitBooking).toHaveBeenCalledWith({
        idempotencyKey: expect.any(String),
        payload: {
          serviceId: 'svc_1',
          barberId: 'barber_1',
          startAt: '2026-07-20T13:00:00.000Z',
          clientName: 'Mateo',
          clientPhone: '+543811234567',
          notes: undefined,
          consentAccepted: true,
          consentVersion: bookingConfig.consent.version,
        },
      });
    });

    expect(onBookingConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'pb_TEST1234567890',
      })
    );
  });

  it('keeps the form visible after a stale-slot conflict so the customer can recover', async () => {
    const user = userEvent.setup();
    const loadAvailability = vi
      .fn()
      .mockResolvedValueOnce({
        slug: shop.slug,
        serviceId: 'svc_1',
        barberId: 'barber_1',
        localDate: '2026-07-20',
        timezone: shop.timezone,
        slotIntervalMinutes: 30,
        serviceDurationMinutes: 30,
        slots: [
          {
            startAt: '2026-07-20T13:00:00.000Z',
            endAt: '2026-07-20T13:30:00.000Z',
          },
          {
            startAt: '2026-07-20T13:30:00.000Z',
            endAt: '2026-07-20T14:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        slug: shop.slug,
        serviceId: 'svc_1',
        barberId: 'barber_1',
        localDate: '2026-07-20',
        timezone: shop.timezone,
        slotIntervalMinutes: 30,
        serviceDurationMinutes: 30,
        slots: [
          {
            startAt: '2026-07-20T13:30:00.000Z',
            endAt: '2026-07-20T14:00:00.000Z',
          },
        ],
      });
    const submitBooking = vi
      .fn()
      .mockRejectedValueOnce(
        new BrowserApiError(
          'Ese horario ya no está disponible. Elegí otro turno para continuar.',
          409,
          'PUBLIC_BOOKING_SLOT_UNAVAILABLE'
        )
      );

    render(
      <PublicBookingFlow
        shop={shop}
        services={services}
        bookingConfig={bookingConfig}
        loadBarbers={vi.fn().mockResolvedValue([
          { barberId: 'barber_1', displayName: 'Mateo' },
        ])}
        loadAvailability={loadAvailability}
        submitBooking={submitBooking}
      />
    );

    await user.click(screen.getByRole('radio', { name: /corte clásico/i }));
    await user.click(await screen.findByRole('radio', { name: /mateo/i }));
    await user.type(screen.getByLabelText(/fecha de reserva/i), '2026-07-20');
    await user.click(
      screen.getByRole('button', { name: /ver horarios disponibles/i })
    );
    await user.click(await screen.findByRole('button', { name: /10:00/i }));

    await user.type(
      screen.getByLabelText(/nombre y apellido/i),
      'Cliente Conflicto'
    );
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234570');
    await user.type(
      screen.getByLabelText(/notas \(opcional\)/i),
      'Conflicto controlado'
    );
    await user.click(screen.getByRole('checkbox', { name: /acepto compartir/i }));
    await user.click(screen.getByRole('button', { name: /reservar turno/i }));

    await expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(/ese horario ya no está disponible/i);
    expect(screen.queryByText(/turno seleccionado/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toHaveValue(
      'Cliente Conflicto'
    );
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue('+543811234570');
    expect(screen.getByLabelText(/notas \(opcional\)/i)).toHaveValue(
      'Conflicto controlado'
    );
    expect(screen.getByRole('button', { name: /10:30/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reservar turno/i })
    ).toBeDisabled();
  });
});
