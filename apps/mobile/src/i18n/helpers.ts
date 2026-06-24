import { mobileLocalizationRuntime } from './runtime.js';
import { SYSTEM_LOCALE_PREFERENCE, type LocalePreference } from './catalog.js';

function t(key: string, options?: Record<string, unknown>): string {
  return mobileLocalizationRuntime.i18n.t(key, options);
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'OWNER':
    case 'BARBER':
    case 'CLIENT':
      return t(`roles.${role}`);
    default:
      return t('roles.UNKNOWN');
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
    case 'INACTIVE':
      return t(`common.states.${status.toLowerCase()}`);
    case 'OPEN':
    case 'CLOSED':
      return t(`common.states.${status.toLowerCase()}`);
    default:
      return t('common.states.unknown');
  }
}

export function getPaymentMethodLabel(paymentMethod: unknown): string {
  if (typeof paymentMethod !== 'string') {
    return t('paymentMethods.UNSPECIFIED');
  }

  const normalized = paymentMethod.trim().toUpperCase();
  switch (normalized) {
    case 'CASH':
    case 'CARD':
    case 'TRANSFER':
    case 'OTHER':
      return t(`paymentMethods.${normalized}`);
    default:
      return t('paymentMethods.UNSPECIFIED');
  }
}

export function getAppointmentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
    case 'CONFIRMED':
    case 'IN_PROGRESS':
    case 'COMPLETED':
    case 'CANCELLED':
    case 'NO_SHOW':
      return t(`appointmentStatuses.${status}`);
    default:
      return t('common.states.unknown');
  }
}

export function getAppointmentTransitionLabel(status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'CANCELLED':
    case 'IN_PROGRESS':
    case 'COMPLETED':
    case 'NO_SHOW':
      return t(`appointmentActions.${status}`);
    default:
      return t('common.states.unknown');
  }
}

export function getLocalizedLanguageLabel(locale: LocalePreference): string {
  if (locale === SYSTEM_LOCALE_PREFERENCE) {
    return t('languages.system');
  }

  return t(`languages.${locale}`);
}

export function getNavigationLabel(
  route: 'home' | 'recordService' | 'services' | 'employees' | 'workingHours' | 'appointments',
): string {
  return t(`navigation.${route}`);
}

export function getPluralLabel(
  key:
    | 'recordCount'
    | 'appointmentCount'
    | 'employeeCount'
    | 'serviceCount'
    | 'selectedCount'
    | 'durationMinutes',
  count: number,
): string {
  return t(`formatting.${key}`, { count });
}

export function translate(key: string, options?: Record<string, unknown>): string {
  return t(key, options);
}
