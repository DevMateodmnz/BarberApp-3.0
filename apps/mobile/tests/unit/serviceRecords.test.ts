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

describe('buildServiceRecordPayload', () => {
  it('includes paymentMethod when selected', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    expect(
      buildServiceRecordPayload({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
        paymentMethod: 'CARD',
      })
    ).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      paymentMethod: 'CARD',
    });
  });

  it('omits paymentMethod when unspecified', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const payload = buildServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      paymentMethod: null,
    });

    expect(payload).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
    });
    expect(payload).not.toHaveProperty('paymentMethod');
  });

  it('includes trimmed clientName when non-empty', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    expect(
      buildServiceRecordPayload({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
        clientName: '  Jane Doe  ',
      })
    ).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      clientName: 'Jane Doe',
    });
  });

  it('omits clientName when empty', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const payload = buildServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      clientName: '',
    });

    expect(payload).not.toHaveProperty('clientName');
  });

  it('omits clientName when whitespace-only', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const payload = buildServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      clientName: '   ',
    });

    expect(payload).not.toHaveProperty('clientName');
  });

  it('includes trimmed notes when non-empty', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    expect(
      buildServiceRecordPayload({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
        notes: '  VIP client  ',
      })
    ).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      notes: 'VIP client',
    });
  });

  it('omits notes when empty', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const payload = buildServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      notes: '',
    });

    expect(payload).not.toHaveProperty('notes');
  });

  it('omits notes when whitespace-only', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const payload = buildServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      notes: '   ',
    });

    expect(payload).not.toHaveProperty('notes');
  });

  it('supports all typed payment methods safely', async () => {
    const { buildServiceRecordPayload } = await importPayloadHelper();

    const paymentMethods = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;

    for (const paymentMethod of paymentMethods) {
      expect(
        buildServiceRecordPayload({
          employeeId: 'emp-1',
          serviceId: 'svc-1',
          priceCents: 2500,
          paymentMethod,
        })
      ).toEqual({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
        paymentMethod,
      });
    }
  });
});

describe('buildBarberServiceRecordPayload', () => {
  it('uses context employeeId, serviceId, priceCents, and optional paymentMethod', async () => {
    const { buildBarberServiceRecordPayload } = await importPayloadHelper();

    expect(
      buildBarberServiceRecordPayload({
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCents: 2500,
        paymentMethod: 'CASH',
      })
    ).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      paymentMethod: 'CASH',
    });
  });

  it('keeps performedAt omitted', async () => {
    const { buildBarberServiceRecordPayload } = await importPayloadHelper();

    const payload = buildBarberServiceRecordPayload({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      paymentMethod: null,
      clientName: '  Jane Doe  ',
      notes: '  VIP client  ',
    });

    expect(payload).toEqual({
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 1500,
      clientName: 'Jane Doe',
      notes: 'VIP client',
    });
    expect(payload).not.toHaveProperty('performedAt');
  });
});

describe('validateServiceRecordDraft', () => {
  it('passes valid integer priceCents input with valid optional clientName and notes', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '25.00',
        clientNameInput: '  Jane Doe  ',
        notesInput: '  VIP client  ',
      })
    ).toEqual({
      ok: true,
      employeeId: 'emp-1',
      serviceId: 'svc-1',
      priceCents: 2500,
      clientName: 'Jane Doe',
      notes: 'VIP client',
    });
  });

  it('fails when owner employee selection is missing', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: null,
        serviceId: 'svc-1',
        priceCentsInput: '25.00',
      })
    ).toEqual({ ok: false, error: 'Select an employee.' });
  });

  it('fails when barber employee context is missing', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'BARBER',
        employeeId: null,
        serviceId: 'svc-1',
        priceCentsInput: '25.00',
      })
    ).toEqual({ ok: false, error: 'Employee context is missing.' });
  });

  it('fails when service selection is missing', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: null,
        priceCentsInput: '25.00',
      })
    ).toEqual({ ok: false, error: 'Select a service.' });
  });

  it('fails for empty price input', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '',
      })
    ).toEqual({ ok: false, error: 'Enter a valid price amount.' });
  });

  it('fails for more than two decimal places', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '10.999',
      })
    ).toEqual({ ok: false, error: 'Enter a valid price amount.' });
  });

  it('fails for negative price input', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '-1',
      })
    ).toEqual({ ok: false, error: 'Enter a valid price amount.' });
  });

  it('fails when clientName exceeds 200 characters', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '25.00',
        clientNameInput: 'a'.repeat(201),
      })
    ).toEqual({ ok: false, error: 'Client name must be 200 characters or fewer.' });
  });

  it('fails when notes exceed 1000 characters', async () => {
    const { validateServiceRecordDraft } = await importPayloadHelper();

    expect(
      validateServiceRecordDraft({
        mode: 'OWNER',
        employeeId: 'emp-1',
        serviceId: 'svc-1',
        priceCentsInput: '25.00',
        notesInput: 'a'.repeat(1001),
      })
    ).toEqual({ ok: false, error: 'Notes must be 1000 characters or fewer.' });
  });
});
