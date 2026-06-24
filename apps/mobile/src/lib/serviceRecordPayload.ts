import { formatCentsForInput, parseCurrencyInputToCents } from './format.js';
import type { CreateServiceRecordInput, PaymentMethod } from './types.js';
import { translate } from '@/i18n/helpers.js';

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

const INVALID_PRICE_ERROR = 'validation.invalidPrice';
const CLIENT_NAME_TOO_LONG_ERROR = 'validation.clientNameTooLong';
const NOTES_TOO_LONG_ERROR = 'validation.notesTooLong';

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
      error:
        mode === 'BARBER'
          ? translate('validation.missingEmployeeContext')
          : translate('validation.selectEmployee'),
    };
  }

  if (!serviceId) {
    return { ok: false, error: translate('validation.selectService') };
  }

  const priceCents = parseCurrencyInputToCents(priceCentsInput);
  if (priceCents === null) {
    return { ok: false, error: translate(INVALID_PRICE_ERROR) };
  }

  const clientName = trimOptionalText(clientNameInput);
  if (clientName && clientName.length > 200) {
    return { ok: false, error: translate(CLIENT_NAME_TOO_LONG_ERROR) };
  }

  const notes = trimOptionalText(notesInput);
  if (notes && notes.length > 1000) {
    return { ok: false, error: translate(NOTES_TOO_LONG_ERROR) };
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

export interface GetNextPriceInputParams {
  currentPriceInput: string;
  /** The default price of the previously selected service, or null if no service was selected. */
  previousServiceDefaultPriceCents: number | null;
  /** The default price of the newly selected service. */
  nextServiceDefaultPriceCents: number;
}

/**
 * Determines the price input value when the user selects a new service.
 *
 * - If the current input is empty → auto-fill with the new service's default.
 * - If the current input matches the PREVIOUS service's default → update to the new default.
 * - Otherwise, the user typed a custom price → preserve it.
 */
export function getNextServiceRecordPriceInput(
  params: GetNextPriceInputParams,
): string {
  const { currentPriceInput, previousServiceDefaultPriceCents, nextServiceDefaultPriceCents } = params;

  // Auto-fill when input is empty (including first-time selection)
  if (currentPriceInput === '') {
    return formatCentsForInput(nextServiceDefaultPriceCents);
  }

  // If the user hasn't modified the price from the previous default, update it
  if (
    previousServiceDefaultPriceCents !== null &&
    currentPriceInput === formatCentsForInput(previousServiceDefaultPriceCents)
  ) {
    return formatCentsForInput(nextServiceDefaultPriceCents);
  }

  // Preserve custom input
  return currentPriceInput;
}
