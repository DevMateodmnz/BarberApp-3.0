import { formatLocalizedDate, formatLocalizedTime } from '@/i18n/index.js';
import type {
  AppointmentNotificationStatus,
  AppointmentNotificationType,
  NotificationAttemptOutcome,
} from './types.js';

export type NotificationOperationsFilter =
  | 'ALL'
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export const NOTIFICATION_OPERATIONS_FILTERS: readonly NotificationOperationsFilter[] = [
  'ALL',
  'PENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;

export function formatNotificationDateTime(value: string): string {
  const date = formatLocalizedDate(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) ?? value;
  const time = formatLocalizedTime(value, {
    hour: '2-digit',
    minute: '2-digit',
  }) ?? value;
  return `${date} • ${time}`;
}

export function getNotificationTypeLabel(
  type: AppointmentNotificationType,
  t: (key: string) => string,
): string {
  if (type === 'BOOKING_CONFIRMATION') {
    return t('notificationsOperations.types.bookingConfirmation');
  }

  return t('notificationsOperations.types.reminder24h');
}

export function getNotificationStatusLabel(
  status: AppointmentNotificationStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case 'PENDING':
      return t('notificationsOperations.status.pending');
    case 'PROCESSING':
      return t('notificationsOperations.status.processing');
    case 'SENT':
      return t('notificationsOperations.status.sent');
    case 'FAILED':
      return t('notificationsOperations.status.failed');
    case 'CANCELLED':
      return t('notificationsOperations.status.cancelled');
    default:
      return status;
  }
}

export function getAttemptOutcomeLabel(
  outcome: NotificationAttemptOutcome,
  t: (key: string) => string,
): string {
  switch (outcome) {
    case 'SENT':
      return t('notificationsOperations.attemptOutcome.sent');
    case 'TEMPORARY_FAILURE':
      return t('notificationsOperations.attemptOutcome.temporaryFailure');
    case 'PERMANENT_FAILURE':
      return t('notificationsOperations.attemptOutcome.permanentFailure');
    default:
      return outcome;
  }
}

export function getFilterLabel(
  filter: NotificationOperationsFilter,
  t: (key: string) => string,
): string {
  switch (filter) {
    case 'ALL':
      return t('notificationsOperations.filters.all');
    case 'PENDING':
      return t('notificationsOperations.filters.pending');
    case 'SENT':
      return t('notificationsOperations.filters.sent');
    case 'FAILED':
      return t('notificationsOperations.filters.failed');
    case 'CANCELLED':
      return t('notificationsOperations.filters.cancelled');
    default:
      return filter;
  }
}
