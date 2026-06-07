import type { CreateServiceRecordInput } from './types.js';

interface BuildBarberServiceRecordPayloadInput {
  employeeId: string;
  priceCents: number;
  serviceId: string;
}

interface ValidateServiceRecordDraftInput {
  employeeId: string | null;
  mode: 'OWNER' | 'BARBER';
  priceCentsInput: string;
  serviceId: string | null;
}

type ServiceRecordDraftValidationResult =
  | { ok: true; employeeId: string; priceCents: number; serviceId: string }
  | { error: string; ok: false };

const INVALID_PRICE_ERROR = 'Enter a valid non-negative integer price in cents.';

export function buildBarberServiceRecordPayload({
  employeeId,
  priceCents,
  serviceId,
}: BuildBarberServiceRecordPayloadInput): CreateServiceRecordInput {
  return {
    employeeId,
    serviceId,
    priceCents,
  };
}

export function validateServiceRecordDraft({
  employeeId,
  mode,
  priceCentsInput,
  serviceId,
}: ValidateServiceRecordDraftInput): ServiceRecordDraftValidationResult {
  if (!employeeId) {
    return {
      ok: false,
      error: mode === 'BARBER' ? 'Employee context is missing.' : 'Select an employee.',
    };
  }

  if (!serviceId) {
    return { ok: false, error: 'Select a service.' };
  }

  if (!/^\d+$/.test(priceCentsInput)) {
    return { ok: false, error: INVALID_PRICE_ERROR };
  }

  const priceCents = Number(priceCentsInput);
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return { ok: false, error: INVALID_PRICE_ERROR };
  }

  return { ok: true, employeeId, serviceId, priceCents };
}
