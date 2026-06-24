/**
 * Pure helper for validating service form input and building a payload.
 *
 * Extracted from services.tsx so both create and update handlers
 * share the same validation logic. No API calls — pure function.
 */
import { parseCurrencyInputToCents } from './format.js';
import { translate } from '@/i18n/helpers.js';

export interface ServiceFormInput {
  name: string;
  priceInput: string;
  durationInput: string;
  description: string;
}

export interface ServiceFormPayload {
  name: string;
  priceCents: number;
  durationMinutes: number;
  description?: string;
}

export type ServiceFormResult =
  | { ok: true; payload: ServiceFormPayload }
  | { ok: false; error: string };

/**
 * Validates service form fields and builds a type-safe payload.
 *
 * - Name is trimmed and required.
 * - Price is parsed via parseCurrencyInputToCents (supports dot/comma decimals).
 * - Duration must be a positive integer.
 * - Description is trimmed; blank descriptions are omitted from payload.
 */
export function validateServiceForm(
  input: ServiceFormInput,
): ServiceFormResult {
  // Name
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, error: translate('services.form.nameRequired') };
  }

  // Price
  const priceCents = parseCurrencyInputToCents(input.priceInput);
  if (priceCents === null) {
    return { ok: false, error: translate('services.form.priceInvalid') };
  }

  // Duration
  const durationMinutes = Number(input.durationInput);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: translate('services.form.durationInvalid') };
  }

  // Description
  const description = input.description.trim();
  const payload: ServiceFormPayload = {
    name,
    priceCents,
    durationMinutes,
  };
  if (description.length > 0) {
    payload.description = description;
  }

  return { ok: true, payload };
}
