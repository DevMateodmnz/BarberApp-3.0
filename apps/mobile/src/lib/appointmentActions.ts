import type {
  AppointmentNotificationSummary,
  AppointmentStatus,
  CurrentUserContext,
} from './types.js';

const OWNER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const BARBER_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [],
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function getAvailableAppointmentTransitions(
  context: CurrentUserContext | null,
  status: AppointmentStatus,
): AppointmentStatus[] {
  if (!context) {
    return [];
  }

  if (context.role === 'OWNER') {
    return OWNER_TRANSITIONS[status] ?? [];
  }

  if (context.role === 'BARBER') {
    return BARBER_TRANSITIONS[status] ?? [];
  }

  return [];
}

export function canRescheduleAppointment(input: {
  status: AppointmentStatus;
  startAt: string;
  deletedAt: string | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return (
    input.status === 'CONFIRMED'
    && input.deletedAt === null
    && new Date(input.startAt).getTime() > now.getTime()
  );
}

export function buildAppointmentNotificationLabels(
  notifications: AppointmentNotificationSummary[] | undefined,
  t: (key: string) => string,
): string[] {
  if (!notifications || notifications.length === 0) {
    return [];
  }

  const labels = notifications
    .map((notification) => {
      if (notification.type === 'BOOKING_CONFIRMATION') {
        if (notification.status === 'SENT') {
          return t('appointments.notification.confirmationSent');
        }
        if (notification.status === 'FAILED') {
          return t('appointments.notification.deliveryError');
        }
        if (notification.status === 'CANCELLED') {
          return t('appointments.notification.confirmationCancelled');
        }
        return t('appointments.notification.confirmationScheduled');
      }

      if (notification.type === 'APPOINTMENT_RESCHEDULED') {
        if (notification.status === 'SENT') {
          return t('appointments.notification.rescheduleSent');
        }
        if (notification.status === 'FAILED') {
          return t('appointments.notification.deliveryError');
        }
        return t('appointments.notification.rescheduleScheduled');
      }

      if (notification.status === 'SENT') {
        return t('appointments.notification.reminderSent');
      }
      if (notification.status === 'FAILED') {
        return t('appointments.notification.deliveryError');
      }
      if (notification.status === 'CANCELLED') {
        return t('appointments.notification.reminderCancelled');
      }
      return t('appointments.notification.reminderScheduled');
    })
    .filter((value, index, array) => array.indexOf(value) === index);

  return labels;
}
