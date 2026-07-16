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
      screen.getByRole('combobox', { name: /servicio/i })
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_1'
    );

    await waitFor(() => {
      expect(loadBarbers).toHaveBeenCalledWith('svc_1');
    });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /profesional/i }),
      'barber_1'
    );
    await user.type(
      screen.getByLabelText(/^fecha$/i),
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

    expect(screen.getByLabelText(/nombre y apellido/i)).toBeInTheDocument();
    expect(screen.getByText(/horarios para 20 de julio de 2026/i)).toBeInTheDocument();
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

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_2'
    );

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

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_1'
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /profesional/i }),
      'barber_1'
    );
    await user.type(
      screen.getByLabelText(/^fecha$/i),
      '2026-07-20'
    );
    await user.click(
      screen.getByRole('button', { name: /ver horarios disponibles/i })
    );
    await user.click(await screen.findByRole('button', { name: /10:00/i }));

    await user.type(screen.getByLabelText(/nombre y apellido/i), 'Mateo');
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234567');
    await user.type(screen.getByLabelText(/email \(opcional\)/i), 'mateo@example.com');
    const consentCheckbox = screen.getByRole('checkbox', {
      name: /acepto compartir mis datos/i,
    });
    await user.click(consentCheckbox);
    await waitFor(() => {
      expect(consentCheckbox).toBeChecked();
    });
    await user.click(screen.getByRole('button', { name: /confirmar turno/i }));

    await waitFor(() => {
      expect(submitBooking).toHaveBeenCalledWith({
        idempotencyKey: expect.any(String),
        payload: {
          serviceId: 'svc_1',
          barberId: 'barber_1',
          startAt: '2026-07-20T13:00:00.000Z',
          clientName: 'Mateo',
          clientPhone: '+543811234567',
          clientEmail: 'mateo@example.com',
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

  it('applies a promotion quote and submits the normalized promotion code', async () => {
    const user = userEvent.setup();
    const submitBooking = vi.fn().mockResolvedValue({
      bookingReference: 'pb_PROMO1234567890',
      barbershopName: 'Mateo Barber',
      serviceName: 'Corte clásico',
      barberName: 'Mateo',
      timezone: shop.timezone,
      localDate: '2026-07-20',
      localStartTime: '10:00',
      startAt: '2026-07-20T13:00:00.000Z',
      endAt: '2026-07-20T13:30:00.000Z',
      status: 'CONFIRMED',
    });
    const quotePromotion = vi.fn().mockResolvedValue({
      promotionName: 'Bienvenida 25%',
      servicePriceCents: 3200,
      discountCents: 800,
      finalPriceCents: 2400,
      currency: 'ARS',
      depositAmountCents: null,
      remainingAmountCents: 0,
    });

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
        quotePromotion={quotePromotion}
        submitBooking={submitBooking}
      />
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /servicio/i }), 'svc_1');
    await user.selectOptions(await screen.findByRole('combobox', { name: /profesional/i }), 'barber_1');
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));

    await user.type(screen.getByLabelText(/teléfono/i), '+543811234567');
    await user.type(screen.getByPlaceholderText(/bienvenida10/i), ' bienvenida 25 ');
    await user.click(screen.getByRole('button', { name: /^aplicar$/i }));

    await waitFor(() => {
      expect(quotePromotion).toHaveBeenCalledWith({
        serviceId: 'svc_1',
        code: 'BIENVENIDA25',
        clientPhone: '+543811234567',
      });
    });

    expect(await screen.findByText(/promoción aplicada: bienvenida 25%/i)).toBeInTheDocument();
    expect(screen.getAllByText(/precio original/i)[0]).toHaveTextContent(/32/);
    expect(screen.getAllByText(/total del turno/i)[0]).toHaveTextContent(/24/);

    await user.type(screen.getByLabelText(/nombre y apellido/i), 'Mateo');
    await user.type(screen.getByLabelText(/email \(opcional\)/i), 'mateo@example.com');
    await user.click(screen.getByRole('checkbox', { name: /acepto compartir mis datos/i }));
    await user.click(screen.getByRole('button', { name: /confirmar turno/i }));

    await waitFor(() => {
      expect(submitBooking).toHaveBeenCalledWith({
        idempotencyKey: expect.any(String),
        payload: expect.objectContaining({
          promotionCode: 'BIENVENIDA25',
        }),
      });
    });
  });

  it('shows the server-calculated deposit disclosure before confirming when the service requires a deposit', async () => {
    const user = userEvent.setup();

    render(
      <PublicBookingFlow
        shop={shop}
        services={[
          {
            ...services[0]!,
            depositRequired: true,
            depositAmountCents: 1500,
            remainingAmountCents: 1700,
          },
        ]}
        bookingConfig={{
          ...bookingConfig,
          depositPolicy: {
            enabled: true,
            mode: 'FIXED',
            holdDurationMinutes: 15,
            currency: 'ARS',
            publicTerms: 'La reserva se confirma con la seña.',
          },
        }}
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
        submitBooking={vi.fn()}
      />
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_1'
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /profesional/i }),
      'barber_1'
    );
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));

    expect(await screen.findByText(/seña para confirmar el turno/i)).toBeInTheDocument();
    expect(screen.getByText(/seña requerida/i)).toHaveTextContent(/15/);
    expect(screen.getByText(/saldo en barbería/i)).toHaveTextContent(/17/);
    expect(screen.getByText(/reservado durante 15 minutos/i)).toBeInTheDocument();
    expect(screen.getByText(/la reserva se confirma con la seña/i)).toBeInTheDocument();
  });

  it('clears an applied promotion when the selected service changes', async () => {
    const user = userEvent.setup();
    const quotePromotion = vi.fn().mockResolvedValue({
      promotionName: 'Bienvenida 25%',
      servicePriceCents: 3200,
      discountCents: 800,
      finalPriceCents: 2400,
      currency: 'ARS',
      depositAmountCents: null,
      remainingAmountCents: 0,
    });

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
        quotePromotion={quotePromotion}
        submitBooking={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /servicio/i }), 'svc_1');
    await user.selectOptions(await screen.findByRole('combobox', { name: /profesional/i }), 'barber_1');
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));
    await user.type(screen.getByPlaceholderText(/bienvenida10/i), 'bienvenida25');
    await user.click(screen.getByRole('button', { name: /^aplicar$/i }));

    expect(await screen.findByText(/promoción aplicada:\s*bienvenida 25%/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /servicio/i }), 'svc_2');

    await waitFor(() => {
      expect(screen.queryByText(/promoción aplicada:\s*bienvenida 25%/i)).not.toBeInTheDocument();
    });
  });

  it('asks the customer to reapply the promotion when the phone changes after quoting', async () => {
    const user = userEvent.setup();
    const quotePromotion = vi.fn().mockResolvedValue({
      promotionName: 'Bienvenida 25%',
      servicePriceCents: 3200,
      discountCents: 800,
      finalPriceCents: 2400,
      currency: 'ARS',
      depositAmountCents: null,
      remainingAmountCents: 0,
    });

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
        quotePromotion={quotePromotion}
        submitBooking={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /servicio/i }), 'svc_1');
    await user.selectOptions(await screen.findByRole('combobox', { name: /profesional/i }), 'barber_1');
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234567');
    await user.type(screen.getByPlaceholderText(/bienvenida10/i), 'bienvenida25');
    await user.click(screen.getByRole('button', { name: /^aplicar$/i }));
    expect(await screen.findByText(/promoción aplicada:\s*bienvenida 25%/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/teléfono/i));
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234568');

    expect(await screen.findByText(/reaplicá la promoción si cambiaste el teléfono/i)).toBeInTheDocument();
    expect(screen.queryByText(/promoción aplicada:\s*bienvenida 25%/i)).not.toBeInTheDocument();
  });

  it('keeps generic promotion-unavailable copy and shows the zero-price booking CTA without Mercado Pago', async () => {
    const user = userEvent.setup();
    const quotePromotion = vi.fn().mockRejectedValue(
      new BrowserApiError('Internal detail should not leak', 409, 'PROMOTION_NOT_AVAILABLE')
    );

    render(
      <PublicBookingFlow
        shop={shop}
        services={[services[0]!]}
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
        quotePromotion={quotePromotion}
        submitBooking={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /servicio/i }), 'svc_1');
    await user.selectOptions(await screen.findByRole('combobox', { name: /profesional/i }), 'barber_1');
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));
    await user.type(screen.getByPlaceholderText(/bienvenida10/i), 'gratis100');
    await user.click(screen.getByRole('button', { name: /^aplicar$/i }));

    expect(await screen.findByText(/el código no está disponible para este turno/i)).toBeInTheDocument();
    expect(screen.queryByText(/internal detail should not leak/i)).not.toBeInTheDocument();

    quotePromotion.mockResolvedValueOnce({
      promotionName: 'Gratis',
      servicePriceCents: 3200,
      discountCents: 3200,
      finalPriceCents: 0,
      currency: 'ARS',
      depositAmountCents: 0,
      remainingAmountCents: 0,
    });

    await user.clear(screen.getByPlaceholderText(/bienvenida10/i));
    await user.type(screen.getByPlaceholderText(/bienvenida10/i), 'gratis100');
    await user.click(screen.getByRole('button', { name: /^aplicar$/i }));

    expect(await screen.findByRole('button', { name: /confirmar turno gratis/i })).toBeInTheDocument();
  });

  it('shows a validation error when the optional email is malformed', async () => {
    const user = userEvent.setup();

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
        submitBooking={vi.fn()}
      />
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_1'
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /profesional/i }),
      'barber_1'
    );
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
    await user.click(screen.getByRole('button', { name: /ver horarios disponibles/i }));
    await user.click(await screen.findByRole('button', { name: /10:00/i }));
    await user.type(screen.getByLabelText(/nombre y apellido/i), 'Mateo');
    await user.type(screen.getByLabelText(/teléfono/i), '+543811234567');
    await user.type(screen.getByLabelText(/email \(opcional\)/i), 'bad-email');
    await user.click(screen.getByRole('checkbox', { name: /acepto compartir mis datos/i }));
    await user.click(screen.getByRole('button', { name: /confirmar turno/i }));

    expect(await screen.findByText(/ingresá un email válido/i)).toBeInTheDocument();
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

    await user.selectOptions(
      screen.getByRole('combobox', { name: /servicio/i }),
      'svc_1'
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /profesional/i }),
      'barber_1'
    );
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-20');
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
    await user.click(screen.getByRole('button', { name: /confirmar turno/i }));

    expect(
      await screen.findByText(/ese horario ya no está disponible/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toHaveValue(
      'Cliente Conflicto'
    );
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue('+543811234570');
    expect(screen.getByLabelText(/notas \(opcional\)/i)).toHaveValue(
      'Conflicto controlado'
    );
    expect(screen.getByRole('button', { name: /10:30/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^10:00$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar turno/i })).toBeInTheDocument();
  });
});
