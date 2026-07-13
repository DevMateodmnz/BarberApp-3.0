import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicBookingFlow } from '@/components/PublicBookingFlow';

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
        loadBarbers={loadBarbers}
        loadAvailability={vi.fn()}
      />
    );

    await user.click(screen.getByRole('radio', { name: /barba/i }));

    expect(
      await screen.findByText(/no hay barberos disponibles para este servicio/i)
    ).toBeInTheDocument();
  });
});
