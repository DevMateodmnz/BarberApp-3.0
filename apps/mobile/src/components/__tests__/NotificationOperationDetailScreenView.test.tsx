import { describe, expect, it, vi } from 'vitest';

import { NotificationOperationDetailScreenView } from '@/components/NotificationOperationDetailScreenView.js';
import type { NotificationOperationsDetail } from '@/lib/types.js';
import { findByTestId, findByText, press } from '@/testing/elementTree.js';

function makeDetail(
  overrides: Partial<NotificationOperationsDetail> = {},
): NotificationOperationsDetail {
  return {
    id: 'notif-1',
    appointmentId: 'appt-1',
    type: 'BOOKING_CONFIRMATION',
    channel: 'EMAIL',
    status: 'FAILED',
    scheduledFor: '2026-07-15T12:00:00.000Z',
    nextAttemptAt: '2026-07-15T12:30:00.000Z',
    attempts: 1,
    manualRetryCount: 1,
    sentAt: null,
    cancelledAt: null,
    customerDisplayName: 'Jane Doe',
    maskedRecipient: 'j***@example.com',
    serviceName: 'Classic Cut',
    employeeName: 'Carlos',
    appointmentStartAt: '2026-07-16T14:00:00.000Z',
    lastError: 'SMTP timeout',
    lastManualRetryAt: '2026-07-15T12:45:00.000Z',
    retryEligible: true,
    attemptsHistory: [
      {
        id: 'attempt-1',
        attemptNumber: 1,
        outcome: 'TEMPORARY_FAILURE',
        attemptedAt: '2026-07-15T12:01:00.000Z',
        completedAt: '2026-07-15T12:01:02.000Z',
        errorCode: 'ETIMEDOUT',
        sanitizedError: 'SMTP timeout',
        durationMs: 2000,
      },
    ],
    ...overrides,
  };
}

function renderView(
  overrides: Partial<Parameters<typeof NotificationOperationDetailScreenView>[0]> = {},
) {
  return NotificationOperationDetailScreenView({
    detail: makeDetail(),
    isLoading: false,
    error: null,
    isRetrying: false,
    retryError: null,
    retrySuccessMessage: null,
    canRetry: true,
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  });
}

describe('NotificationOperationDetailScreenView', () => {
  it('renders loading and error states without detail data', () => {
    const loadingTree = renderView({ detail: null, isLoading: true });
    expect(findByTestId(loadingTree, 'notification-detail-loading')).toBeDefined();
    expect(findByText(loadingTree, 'Loading notification detail…')).toBeDefined();

    const onRefresh = vi.fn();
    const errorTree = renderView({
      detail: null,
      isLoading: false,
      error: 'Lookup failed',
      onRefresh,
    });
    expect(findByTestId(errorTree, 'notification-detail-error')).toBeDefined();
    press(findByTestId(errorTree, 'notification-detail-error-retry'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders notification detail, attempt history, and retry action', () => {
    const onRetry = vi.fn();
    const tree = renderView({
      retrySuccessMessage: 'Retry scheduled successfully.',
      onRetry,
    });

    expect(findByTestId(tree, 'notification-detail-summary')).toBeDefined();
    expect(findByText(tree, 'Jane Doe')).toBeDefined();
    expect(findByText(tree, 'j***@example.com')).toBeDefined();
    expect(findByText(tree, 'SMTP timeout')).toBeDefined();
    expect(findByTestId(tree, 'notification-attempt-attempt-1')).toBeDefined();
    expect(findByTestId(tree, 'notification-detail-retry-success')).toBeDefined();

    press(findByTestId(tree, 'notification-detail-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an empty attempts state when there is no history', () => {
    const tree = renderView({
      detail: makeDetail({ attemptsHistory: [], lastError: null, retryEligible: false }),
      canRetry: false,
    });

    expect(findByTestId(tree, 'notification-detail-attempts')).toBeDefined();
    expect(findByText(tree, 'No delivery attempts recorded yet.')).toBeDefined();
  });
});
