/**
 * Unit tests for service record creation fetcher — PR-029B
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
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
    mockApi as unknown as ReturnType<typeof axios.default.create>
  );
  return import('../../src/lib/api.js');
}

async function importServiceRecords() {
  await importApi();
  return import('../../src/lib/serviceRecords.js');
}

async function importPayloadHelper() {
  return import('../../src/lib/serviceRecordPayload.js');
}

describe('createServiceRecord', () => {
  it('sends authenticated POST to /barbershops/:barbershopId/service-records', async () => {
    const { createServiceRecord } = await importServiceRecords();
    const fakeRecord = {
      id: 'record-1',
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      paymentMethod: null,
      clientName: null,
      notes: null,
      performedAt: '2026-06-07T00:00:00.000Z',
      service: { id: 'svc-1', name: 'Classic Cut' },
      employee: { id: 'emp-1', user: { id: 'user-1', name: 'Barber One' } },
    };

    mockApi.post.mockResolvedValueOnce({
      data: { success: true, data: fakeRecord },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const payload = {
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
    };

    const result = await createServiceRecord(getToken, 'shop-1', payload);

    expect(getToken).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/service-records',
      payload,
      { headers: { Authorization: 'Bearer owner-token' } }
    );
    expect(result).toEqual(fakeRecord);
  });

  it('omits performedAt in this first slice and sends employeeId, serviceId, priceCents', async () => {
    const { createServiceRecord } = await importServiceRecords();

    mockApi.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 'record-1' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await createServiceRecord(getToken, 'shop-1', {
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
    });

    const [, body] = mockApi.post.mock.calls[0]!;
    expect(body).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
    });
    expect(body).not.toHaveProperty('performedAt');
  });

  it('handles API error', async () => {
    const { createServiceRecord } = await importServiceRecords();

    mockApi.post.mockResolvedValueOnce({
      data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Employee ID is required' } },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');

    await expect(
      createServiceRecord(getToken, 'shop-1', {
        employeeId: '',
        serviceId: 'svc-1',
        priceCents: 2500,
      })
    ).rejects.toThrow('Employee ID is required');
  });
});

describe('buildBarberServiceRecordPayload', () => {
  it('uses context employeeId, serviceId, and priceCents', async () => {
    const { buildBarberServiceRecordPayload } = await importPayloadHelper();

    expect(
      buildBarberServiceRecordPayload({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
      })
    ).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
    });
  });

  it('keeps performedAt omitted', async () => {
    const { buildBarberServiceRecordPayload } = await importPayloadHelper();

    const payload = buildBarberServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
    });

    expect(payload).not.toHaveProperty('performedAt');
  });
});
