import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  };
}

let mockApi: ReturnType<typeof createMockApi>;

beforeEach(() => {
  vi.resetModules();
  mockApi = createMockApi();
});

async function importApi() {
  const axios = await import('axios');
  vi.spyOn(axios.default, 'create').mockReturnValue(
    mockApi as unknown as ReturnType<typeof axios.default.create>,
  );
  return import('../../src/lib/api.js');
}

async function importAppointments() {
  await importApi();
  return import('../../src/lib/appointments.js');
}

describe('fetchAppointmentAvailability', () => {
  it('builds the committed availability route and query params', async () => {
    const { fetchAppointmentAvailability } = await importAppointments();
    const fakeAvailability = {
      localDate: '2026-06-29',
      barbershopTimezone: 'America/Argentina/Buenos_Aires',
      slotIntervalMinutes: 30,
      serviceDurationMinutes: 45,
      slots: [
        {
          startAt: '2026-06-29T13:00:00.000Z',
          endAt: '2026-06-29T13:45:00.000Z',
          localStartTime: '10:00',
          localEndTime: '10:45',
        },
      ],
    };

    mockApi.get.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: fakeAvailability },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchAppointmentAvailability(getToken, 'shop-1', {
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      localDate: '2026-06-29',
    });

    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employees/emp-1/appointments/availability',
      {
        headers: { Authorization: 'Bearer owner-token' },
        params: {
          serviceId: 'svc-1',
          localDate: '2026-06-29',
        },
      },
    );
    expect(result).toEqual(fakeAvailability);
  });
});

describe('createStaffAppointment', () => {
  it('OWNER request includes employeeId and only the allowed body fields', async () => {
    const { createStaffAppointment } = await importAppointments();
    const created = {
      id: 'appt-1',
      barbershopId: 'shop-1',
      employeeId: 'emp-1',
      clientId: null,
      serviceId: 'svc-1',
      clientName: 'Guest Client',
      clientPhone: '+54 381 555 1111',
      serviceName: 'Classic Cut',
      servicePriceCents: 2500,
      serviceDurationMinutes: 30,
      serviceCurrency: 'ARS',
      startAt: '2026-06-29T13:00:00.000Z',
      endAt: '2026-06-29T13:30:00.000Z',
      status: 'PENDING',
      notes: 'Walk in',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
      deletedAt: null,
      barbershop: { id: 'shop-1', name: 'Main Shop' },
      employee: { id: 'emp-1', user: { id: 'u-1', name: 'Carlos' } },
      client: null,
      service: {
        id: 'svc-1',
        name: 'Classic Cut',
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
      },
    };

    mockApi.post.mockResolvedValueOnce({
      status: 201,
      data: { success: true, data: created },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await createStaffAppointment(getToken, 'shop-1', {
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      startAt: '2026-06-29T13:00:00.000Z',
      clientName: '  Guest Client  ',
      clientPhone: '  +54 381 555 1111  ',
      notes: '  Walk in  ',
      status: 'CONFIRMED',
      endAt: '2026-06-29T13:30:00.000Z',
      servicePriceCents: 1,
      serviceDurationMinutes: 99,
      serviceName: 'Injected',
      barbershopId: 'other-shop',
    } as Record<string, unknown> as Parameters<typeof createStaffAppointment>[2]);

    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/appointments',
      {
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        startAt: '2026-06-29T13:00:00.000Z',
        clientName: 'Guest Client',
        clientPhone: '+54 381 555 1111',
        notes: 'Walk in',
      },
      { headers: { Authorization: 'Bearer owner-token' } },
    );
  });

  it('BARBER request omits employeeId and normalizes empty optionals away', async () => {
    const { createStaffAppointment } = await importAppointments();
    const created = {
      id: 'appt-2',
      barbershopId: 'shop-1',
      employeeId: 'emp-barber',
      clientId: null,
      clientName: 'Walk In',
      clientPhone: null,
      serviceId: 'svc-2',
      serviceName: 'Beard Trim',
      servicePriceCents: 3000,
      serviceDurationMinutes: 45,
      serviceCurrency: 'ARS',
      startAt: '2026-06-29T14:00:00.000Z',
      endAt: '2026-06-29T14:45:00.000Z',
      status: 'PENDING',
      notes: null,
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
      deletedAt: null,
      barbershop: { id: 'shop-1', name: 'Main Shop' },
      employee: { id: 'emp-barber', user: { id: 'u-barber', name: 'Ana' } },
      client: null,
      service: {
        id: 'svc-2',
        name: 'Beard Trim',
        durationMinutes: 45,
        priceCents: 3000,
        currency: 'ARS',
      },
    };

    mockApi.post.mockResolvedValueOnce({
      status: 201,
      data: { success: true, data: created },
    });

    const getToken = vi.fn().mockResolvedValue('barber-token');
    const result = await createStaffAppointment(getToken, 'shop-1', {
      serviceId: 'svc-2',
      startAt: '2026-06-29T14:00:00.000Z',
      clientName: 'Walk In',
      clientPhone: '   ',
      notes: '',
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/appointments',
      {
        serviceId: 'svc-2',
        startAt: '2026-06-29T14:00:00.000Z',
        clientName: 'Walk In',
      },
      { headers: { Authorization: 'Bearer barber-token' } },
    );
    expect(result.clientId).toBeNull();
    expect(result.client).toBeNull();
  });
});
