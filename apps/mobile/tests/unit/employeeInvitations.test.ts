import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
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

async function importEmployeeInvitations() {
  await importApi();
  return import('../../src/lib/employeeInvitations.js');
}

function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    email: 'barber@example.com',
    invitedRole: 'BARBER',
    status: 'PENDING',
    expiresAt: '2026-07-01T00:00:00.000Z',
    lastSentAt: '2026-06-26T00:00:00.000Z',
    resendCount: 0,
    acceptedAt: null,
    revokedAt: null,
    userId: null,
    employeeId: null,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('employee invitation mobile API contracts', () => {
  it('creates invitations with the committed route, exact body, and normalized email', async () => {
    const { createEmployeeInvitation } = await importEmployeeInvitations();
    const response = {
      outcome: 'invitation_created',
      employee: null,
      invitation: makeInvitation(),
    };
    mockApi.post.mockResolvedValueOnce({
      status: 201,
      data: { success: true, data: response },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await createEmployeeInvitation(
      getToken,
      'shop-1',
      '  BARBER@Example.com  ',
    );

    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/employee-invitations',
      { email: 'barber@example.com' },
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result).toEqual(response);
  });

  it('parses all committed create outcomes without assuming privileged Clerk fields', async () => {
    const { createEmployeeInvitation } = await importEmployeeInvitations();
    const getToken = vi.fn().mockResolvedValue('owner-token');
    const outcomes = [
      {
        outcome: 'employee_created',
        employee: {
          id: 'emp-1',
          barbershopId: 'shop-1',
          userId: 'user-1',
          isActive: true,
          createdAt: '2026-06-26T00:00:00.000Z',
          updatedAt: '2026-06-26T00:00:00.000Z',
          user: {
            id: 'user-1',
            email: 'barber@example.com',
            name: 'Barber',
            role: 'BARBER',
          },
        },
        invitation: null,
      },
      {
        outcome: 'employee_reactivated',
        employee: {
          id: 'emp-2',
          barbershopId: 'shop-1',
          userId: 'user-2',
          isActive: true,
          createdAt: '2026-06-26T00:00:00.000Z',
          updatedAt: '2026-06-26T00:00:00.000Z',
          user: {
            id: 'user-2',
            email: 'reactivated@example.com',
            name: 'Reactivated',
            role: 'BARBER',
          },
        },
        invitation: null,
      },
      {
        outcome: 'invitation_created',
        employee: null,
        invitation: makeInvitation({ id: 'inv-3', status: 'DELIVERY_FAILED' }),
      },
      {
        outcome: 'invitation_pending',
        employee: null,
        invitation: makeInvitation({ id: 'inv-4', status: 'EXPIRED' }),
      },
    ] as const;

    for (const outcome of outcomes) {
      mockApi.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, data: outcome },
      });
      await expect(
        createEmployeeInvitation(getToken, 'shop-1', `${outcome.outcome}@example.com`),
      ).resolves.toEqual(outcome);
    }
  });

  it('lists invitations via the committed index route', async () => {
    const { fetchEmployeeInvitations } = await importEmployeeInvitations();
    const response = [
      makeInvitation({ status: 'PENDING' }),
      makeInvitation({ id: 'inv-2', status: 'DELIVERY_FAILED' }),
    ];
    mockApi.get.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: response },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    const result = await fetchEmployeeInvitations(getToken, 'shop-1');

    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employee-invitations',
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(result[1].status).toBe('DELIVERY_FAILED');
  });

  it('resends and revokes invitations with the committed routes and methods', async () => {
    const {
      resendEmployeeInvitation,
      revokeEmployeeInvitation,
    } = await importEmployeeInvitations();
    const resent = makeInvitation({
      resendCount: 3,
      lastSentAt: '2026-06-27T00:00:00.000Z',
      expiresAt: '2026-07-04T00:00:00.000Z',
    });
    const revoked = makeInvitation({
      status: 'REVOKED',
      revokedAt: '2026-06-27T02:00:00.000Z',
    });

    mockApi.post.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: resent },
    });
    mockApi.delete.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: revoked },
    });

    const getToken = vi.fn().mockResolvedValue('owner-token');
    await expect(
      resendEmployeeInvitation(getToken, 'shop-1', 'inv-1'),
    ).resolves.toEqual(resent);
    await expect(
      revokeEmployeeInvitation(getToken, 'shop-1', 'inv-1'),
    ).resolves.toEqual(revoked);

    expect(mockApi.post).toHaveBeenCalledWith(
      '/barbershops/shop-1/employee-invitations/inv-1/resend',
      undefined,
      { headers: { Authorization: 'Bearer owner-token' } },
    );
    expect(mockApi.delete).toHaveBeenCalledWith(
      '/barbershops/shop-1/employee-invitations/inv-1',
      { headers: { Authorization: 'Bearer owner-token' } },
    );
  });

  it('reconciles onboarding before a local user exists and sends no identity body', async () => {
    const { reconcileEmployeeInvitationOnboarding } = await importEmployeeInvitations();
    const response = {
      outcome: 'already_reconciled',
      userId: 'user-1',
      employeeId: 'emp-1',
      barbershopId: 'shop-1',
    };
    mockApi.post.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: response },
    });

    const getToken = vi.fn().mockResolvedValue('barber-token');
    const result = await reconcileEmployeeInvitationOnboarding(getToken);

    expect(mockApi.post).toHaveBeenCalledWith(
      '/onboarding/employee-invitations/reconcile',
      undefined,
      { headers: { Authorization: 'Bearer barber-token' } },
    );
    expect(result).toEqual(response);
  });

  it('omits authorization headers when Clerk has no token yet', async () => {
    const { fetchEmployeeInvitations } = await importEmployeeInvitations();
    mockApi.get.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: [] },
    });

    const getToken = vi.fn().mockResolvedValue(null);
    await fetchEmployeeInvitations(getToken, 'shop-1');

    expect(mockApi.get).toHaveBeenCalledWith(
      '/barbershops/shop-1/employee-invitations',
      { headers: undefined },
    );
  });
});
