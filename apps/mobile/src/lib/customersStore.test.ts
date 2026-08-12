import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerDetail,
  CustomerDirectoryPage,
  CustomerSummary,
} from '@/lib/types.js';

const customerApiMocks = vi.hoisted(() => ({
  fetchCustomers: vi.fn(),
  searchCustomers: vi.fn(),
  fetchCustomerDetail: vi.fn(),
  patchCustomer: vi.fn(),
}));

vi.mock('@/lib/customers.js', () => customerApiMocks);

import { useCustomersStore } from '@/lib/customersStore.js';

function makeCustomer(overrides: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    id: 'cust-1',
    name: 'Juan Pérez',
    phone: '+54 381 555 1111',
    email: 'juan@example.com',
    firstSeenAt: '2026-07-01T10:00:00.000Z',
    lastSeenAt: '2026-07-10T10:00:00.000Z',
    completedCount: 3,
    cancelledCount: 1,
    noShowCount: 0,
    upcomingCount: 1,
    lastServiceName: 'Classic Cut',
    lastEmployeeName: 'Carlos',
    ...overrides,
  };
}

function makePage(overrides: Partial<CustomerDirectoryPage> = {}): CustomerDirectoryPage {
  return {
    items: [makeCustomer()],
    total: 1,
    page: 1,
    limit: 20,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    ...makeCustomer(),
    internalNotes: 'Prefers morning appointments',
    loyalty: {
      programEnabled: true,
      visitsRequired: 5,
      currentStampCount: 3,
      lifetimeEligibleVisits: 8,
      availableRewardCount: 1,
      lastEarnedAt: '2026-07-10T10:00:00.000Z',
      rewards: [],
    },
    recentAppointments: [],
    upcomingAppointments: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const getToken = async () => 'token';

afterEach(() => {
  vi.clearAllMocks();
  useCustomersStore.getState().clearCustomers();
});

describe('useCustomersStore', () => {
  it('loads the default customer list', async () => {
    customerApiMocks.fetchCustomers.mockResolvedValueOnce(makePage());

    await useCustomersStore.getState().loadCustomers(getToken, 'shop-1');

    expect(customerApiMocks.fetchCustomers).toHaveBeenCalledWith(getToken, 'shop-1', {
      page: 1,
      limit: 20,
      sort: 'recent',
    });
    expect(useCustomersStore.getState().items).toHaveLength(1);
    expect(useCustomersStore.getState().customersError).toBeNull();
  });

  it('uses the body-search endpoint for non-empty queries', async () => {
    customerApiMocks.searchCustomers.mockResolvedValueOnce(
      makePage({
        items: [makeCustomer({ id: 'cust-2', name: 'Ana Gómez' })],
      })
    );

    await useCustomersStore.getState().loadCustomers(getToken, 'shop-1', {
      query: '  Ana  ',
    });

    expect(customerApiMocks.searchCustomers).toHaveBeenCalledWith(getToken, 'shop-1', {
      query: 'Ana',
      page: 1,
      limit: 20,
      sort: 'recent',
    });
    expect(useCustomersStore.getState().query).toBe('Ana');
    expect(useCustomersStore.getState().items[0]?.name).toBe('Ana Gómez');
  });

  it('appends additional pages when loading more customers', async () => {
    customerApiMocks.fetchCustomers
      .mockResolvedValueOnce(
        makePage({
          items: [makeCustomer({ id: 'cust-1' })],
          total: 2,
        })
      )
      .mockResolvedValueOnce(
        makePage({
          items: [makeCustomer({ id: 'cust-2', name: 'Ana Gómez' })],
          total: 2,
          page: 2,
        })
      );

    await useCustomersStore.getState().loadCustomers(getToken, 'shop-1');
    await useCustomersStore.getState().loadMoreCustomers(getToken, 'shop-1');

    expect(useCustomersStore.getState().items.map((item) => item.id)).toEqual([
      'cust-1',
      'cust-2',
    ]);
    expect(useCustomersStore.getState().page).toBe(2);
  });

  it('ignores stale list responses that finish after a newer request', async () => {
    const first = deferred<CustomerDirectoryPage>();
    customerApiMocks.fetchCustomers.mockReturnValueOnce(first.promise);
    customerApiMocks.searchCustomers.mockResolvedValueOnce(
      makePage({
        items: [makeCustomer({ id: 'cust-2', name: 'Ana Gómez' })],
      })
    );

    const firstRequest = useCustomersStore
      .getState()
      .loadCustomers(getToken, 'shop-1');

    const secondRequest = useCustomersStore.getState().loadCustomers(getToken, 'shop-1', {
      query: 'Ana',
    });

    await secondRequest;
    first.resolve(makePage({ items: [makeCustomer({ id: 'cust-stale', name: 'Stale' })] }));
    await firstRequest;

    expect(useCustomersStore.getState().items[0]?.id).toBe('cust-2');
    expect(useCustomersStore.getState().query).toBe('Ana');
  });

  it('updates both the list row and detail record after saving a customer', async () => {
    useCustomersStore.setState({
      items: [makeCustomer()],
      customerDetail: makeDetail(),
      customerDetailError: null,
      isCustomerSaving: false,
    });
    customerApiMocks.patchCustomer.mockResolvedValueOnce({
      id: 'cust-1',
      name: 'Juan Updated',
      email: 'updated@example.com',
      internalNotes: 'VIP client',
    });

    await useCustomersStore.getState().updateCustomer(getToken, 'shop-1', 'cust-1', {
      name: 'Juan Updated',
      email: 'updated@example.com',
      internalNotes: 'VIP client',
    });

    expect(useCustomersStore.getState().items[0]?.name).toBe('Juan Updated');
    expect(useCustomersStore.getState().customerDetail?.email).toBe('updated@example.com');
    expect(useCustomersStore.getState().customerDetail?.internalNotes).toBe('VIP client');
    expect(useCustomersStore.getState().isCustomerSaving).toBe(false);
  });
});
