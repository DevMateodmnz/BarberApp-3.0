import { describe, expect, it, vi } from 'vitest';

import { NotificationOperationsScreenView } from '@/components/NotificationOperationsScreenView.js';
import type {
  NotificationOperationsListItem,
  NotificationOperationsSummary,
} from '@/lib/types.js';
import { findByTestId, findByText, press } from '@/testing/elementTree.js';

function makeSummary(
  overrides: Partial<NotificationOperationsSummary> = {},
): NotificationOperationsSummary {
  return {
    pending: 2,
    processing: 0,
    sent: 4,
    failed: 1,
    cancelled: 1,
    dueNow: 1,
    retrying: 1,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<NotificationOperationsListItem> = {},
): NotificationOperationsListItem {
  return {
    id: 'notif-1',
    appointmentId: 'appt-1',
    type: 'BOOKING_CONFIRMATION',
    channel: 'EMAIL',
    status: 'FAILED',
    scheduledFor: '2026-07-15T12:00:00.000Z',
    nextAttemptAt: '2026-07-15T12:30:00.000Z',
    attempts: 2,
    manualRetryCount: 1,
    sentAt: null,
    cancelledAt: null,
    customerDisplayName: 'Jane Doe',
    maskedRecipient: 'j***@example.com',
    serviceName: 'Classic Cut',
    employeeName: 'Carlos',
    appointmentStartAt: '2026-07-16T14:00:00.000Z',
    ...overrides,
  };
}

function renderView(
  overrides: Partial<Parameters<typeof NotificationOperationsScreenView>[0]> = {},
) {
  return NotificationOperationsScreenView({
    canAccess: true,
    isContextLoading: false,
    contextError: null,
    summary: makeSummary(),
    isSummaryLoading: false,
    summaryError: null,
    items: [makeItem()],
    total: 1,
    selectedFilter: 'ALL',
    isNotificationsLoading: false,
    isRefreshingNotifications: false,
    isLoadingMoreNotifications: false,
    notificationsError: null,
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    onFilterChange: vi.fn(),
    onOpenNotification: vi.fn(),
    onLoadMore: vi.fn(),
    ...overrides,
  });
}

describe('NotificationOperationsScreenView', () => {
  it('renders the blocked state when notification operations are unavailable', () => {
    const tree = renderView({ canAccess: false, items: [], total: 0, summary: null });

    expect(findByTestId(tree, 'notifications-operations-blocked')).toBeDefined();
    expect(findByText(tree, 'Notification operations are available only to barbershop owners.')).toBeDefined();
  });

  it('renders summary, filters, result count, and row actions', () => {
    const onFilterChange = vi.fn();
    const onOpenNotification = vi.fn();
    const onLoadMore = vi.fn();

    const tree = renderView({
      total: 2,
      items: [
        makeItem(),
      ],
      onFilterChange,
      onOpenNotification,
      onLoadMore,
    });

    expect(findByTestId(tree, 'notifications-summary-pending')).toBeDefined();
    expect(findByTestId(tree, 'notifications-operations-filter-bar')).toBeDefined();
    expect(findByText(tree, '2 notifications')).toBeDefined();
    expect(findByText(tree, '2 attempts')).toBeDefined();

    press(findByTestId(tree, 'notifications-filter-FAILED'));
    press(findByTestId(tree, 'notification-open-notif-1'));
    press(findByTestId(tree, 'notifications-operations-load-more'));

    expect(onFilterChange).toHaveBeenCalledWith('FAILED');
    expect(onOpenNotification).toHaveBeenCalledWith('notif-1');
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders empty and error states with retry action', () => {
    const onRetry = vi.fn();

    const errorTree = renderView({
      summary: null,
      items: [],
      total: 0,
      notificationsError: 'Load failed',
      onRetry,
    });
    expect(findByTestId(errorTree, 'notifications-operations-error')).toBeDefined();
    press(findByTestId(errorTree, 'notifications-operations-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const emptyTree = renderView({ items: [], total: 0, notificationsError: null });
    expect(findByTestId(emptyTree, 'notifications-operations-empty')).toBeDefined();
  });
});
