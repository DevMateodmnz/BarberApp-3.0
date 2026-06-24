import { ApiError } from '@/lib/api.js';

import { mobileLocalizationRuntime } from './runtime.js';

const EMPLOYEE_NOT_FOUND_MESSAGES = new Set(['User not found']);
const EMPLOYEE_CONFLICT_MESSAGES = new Set(['User is already an employee of this barbershop']);

export function localizeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return translate('errors.employeeNotFound');
    }

    if (error.status === 409 || error.code === 'CONFLICT') {
      return translate('errors.employeeConflict');
    }

    return localizeUnknownError(error.message);
  }

  if (typeof error === 'string') {
    if (EMPLOYEE_NOT_FOUND_MESSAGES.has(error)) {
      return translate('errors.employeeNotFound');
    }

    if (EMPLOYEE_CONFLICT_MESSAGES.has(error)) {
      return translate('errors.employeeConflict');
    }

    return localizeUnknownError(error);
  }

  if (error instanceof Error) {
    return localizeUnknownError(error.message);
  }

  return translate('errors.unknownApi');
}

export function localizeUnknownError(rawMessage?: string): string {
  const fallback = translate('errors.unknownApi');

  if (
    process.env.NODE_ENV !== 'production'
    && rawMessage
    && rawMessage.trim().length > 0
    && rawMessage !== fallback
  ) {
    return `${fallback} [${rawMessage}]`;
  }

  return fallback;
}

function translate(key: string): string {
  return mobileLocalizationRuntime.i18n.t(key);
}
