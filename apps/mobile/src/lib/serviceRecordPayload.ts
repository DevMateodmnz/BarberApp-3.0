import { parseCurrencyInputToCents } from './format.js';
import type { CreateServiceRecordInput, PaymentMethod } from './types.js';

interface BuildServiceRecordPayloadInput {
  clientName?: string | null;
  employeeId: string;
  notes?: string | null;
  paymentMethod?: PaymentMethod | null;
  priceCents: number;
  serviceId: string;
}

interface ValidateServiceRecordDraftInput {
  clientNameInput?: string;
  employeeId: string | null;
  mode: 'OWNER' | 'BARBER';
  notesInput?: string;
  priceCentsInput: string;
  serviceId: string | null;
}

type ServiceRecordDraftValidationResult =
  | {
      clientName?: string;
      employeeId: string;
      notes?: string;
      ok: true;
      priceCents: number;
      serviceId: string;
    }
  | { error: string; ok: false };

const INVALID_PRICE_ERROR = 'Enter a valid price amount.';
const CLIENT_NAME_TOO_LONG_ERROR = 'Client name must be 200 characters or fewer.';
const NOTES_TOO_LONG_ERROR = 'Notes must be 1000 characters or fewer.';

function trimOptionalText(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildServiceRecordPayload({
  clientName,
  employeeId,
  notes,
  paymentMethod,
  priceCents,
  serviceId,
}: BuildServiceRecordPayloadInput): CreateServiceRecordInput {
  const trimmedClientName = trimOptionalText(clientName);
  const trimmedNotes = trimOptionalText(notes);

  return {
    employeeId,
    serviceId,
    priceCents,
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(trimmedClientName ? { clientName: trimmedClientName } : {}),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  };
}

export function buildBarberServiceRecordPayload(
  input: BuildServiceRecordPayloadInput
): CreateServiceRecordInput {
  return buildServiceRecordPayload(input);
}

export function validateServiceRecordDraft({
  clientNameInput,
  employeeId,
  mode,
  notesInput,
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

  const priceCents = parseCurrencyInputToCents(priceCentsInput);
  if (priceCents === null) {
    return { ok: false, error: INVALID_PRICE_ERROR };
  }

  const clientName = trimOptionalText(clientNameInput);
  if (clientName && clientName.length > 200) {
    return { ok: false, error: CLIENT_NAME_TOO_LONG_ERROR };
  }

  const notes = trimOptionalText(notesInput);
  if (notes && notes.length > 1000) {
    return { ok: false, error: NOTES_TOO_LONG_ERROR };
  }

  return {
    ok: true,
    employeeId,
    serviceId,
    priceCents,
    ...(clientName ? { clientName } : {}),
    ...(notes ? { notes } : {}),
  };
}
