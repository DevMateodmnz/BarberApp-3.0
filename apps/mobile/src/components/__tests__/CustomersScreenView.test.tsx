import { describe, expect, it, vi } from 'vitest';

import { CustomersScreenView } from '@/components/CustomersScreenView.js';
import type { CustomerSummary } from '@/lib/types.js';
import {
  changeText,
  findByDisplayName,
  findByTestId,
  findByText,
  press,
  queryByTestId,
} from '@/testing/elementTree.js';

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

function renderView(overrides: Partial<Parameters<typeof CustomersScreenView>[0]> = {}) {
  return CustomersScreenView({
    canAccessDirectory: true,
    isContextLoading: false,
    contextError: null,
    searchQuery: '',
    sort: 'recent',
    items: [makeCustomer()],
    total: 1,
    isCustomersLoading: false,
    isRefreshingCustomers: false,
    isLoadingMoreCustomers: false,
    customersError: null,
    onBack: vi.fn(),
    onSearchChange: vi.fn(),
    onClearSearch: vi.fn(),
    onSortChange: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onOpenCustomer: vi.fn(),
    ...overrides,
  });
}

describe('CustomersScreenView', () => {
  it('renders the blocked state when directory access is unavailable', () => {
    const tree = renderView({
      canAccessDirectory: false,
      items: [],
      total: 0,
    });

    expect(findByTestId(tree, 'customers-blocked')).toBeDefined();
    expect(findByText(tree, 'The customer directory is available only to owners and barbers.')).toBeDefined();
  });

  it('renders search, results, badges, and customer row actions', () => {
    const onSearchChange = vi.fn();
    const onOpenCustomer = vi.fn();
    const onSortChange = vi.fn();
    const tree = renderView({
      searchQuery: 'Juan',
      total: 2,
      items: [
        makeCustomer({
          noShowCount: 2,
          upcomingCount: 1,
        }),
      ],
      onSearchChange,
      onOpenCustomer,
      onSortChange,
    });

    changeText(
      findByDisplayName(findByTestId(tree, 'customers-search-input'), 'TextInput'),
      'Juana'
    );
    press(findByTestId(tree, 'customers-sort-name'));
    press(findByTestId(tree, 'customer-row-cust-1'));

    expect(onSearchChange).toHaveBeenCalledWith('Juana');
    expect(onSortChange).toHaveBeenCalledWith('name');
    expect(onOpenCustomer).toHaveBeenCalledWith('cust-1');
    expect(findByText(tree, '2 customers')).toBeDefined();
    expect(findByText(tree, '2 no-shows')).toBeDefined();
    expect(findByText(tree, 'Upcoming')).toBeDefined();
    expect(findByTestId(tree, 'customers-search-clear')).toBeDefined();
  });

  it('renders empty, error, and load-more states', () => {
    const onRetry = vi.fn();
    const onLoadMore = vi.fn();

    const errorTree = renderView({
      customersError: 'Load failed',
      items: [],
      total: 0,
      onRetry,
    });
    expect(findByTestId(errorTree, 'customers-error')).toBeDefined();
    press(findByTestId(errorTree, 'customers-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const emptyTree = renderView({ items: [], total: 0 });
    expect(findByTestId(emptyTree, 'customers-empty')).toBeDefined();

    const loadMoreTree = renderView({
      items: [makeCustomer()],
      total: 2,
      onLoadMore,
    });
    expect(queryByTestId(loadMoreTree, 'customers-load-more')).not.toBeNull();
    press(findByTestId(loadMoreTree, 'customers-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
