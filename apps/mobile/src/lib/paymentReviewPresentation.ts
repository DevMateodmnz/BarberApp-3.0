import type { TFunction } from 'i18next';
import type { PaymentReviewResolution, PaymentReviewStatus, PaymentReviewReason } from './types.js';

export const PAYMENT_REVIEW_FILTERS = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type PaymentReviewFilter = (typeof PAYMENT_REVIEW_FILTERS)[number];

export const PAYMENT_REVIEW_RESOLUTION_OPTIONS: PaymentReviewResolution[] = [
  'REFUNDED_EXTERNALLY',
  'NO_REFUND_REQUIRED',
  'CUSTOMER_CREDIT_GRANTED',
  'PAYMENT_ACCEPTED_MANUALLY',
  'DUPLICATE_RESOLVED',
  'OTHER',
];

export function getPaymentReviewFilterStatus(filter: PaymentReviewFilter): PaymentReviewStatus | undefined {
  return filter === 'ALL' ? undefined : filter;
}

export function formatPaymentReviewFilter(filter: PaymentReviewFilter, t: TFunction): string {
  return t(`paymentsSettings.reviews.filters.${filter}`);
}

export function formatPaymentReviewStatus(status: PaymentReviewStatus, t: TFunction): string {
  return t(`paymentsSettings.reviews.status.${status}`);
}

export function formatPaymentReviewReason(reason: PaymentReviewReason, t: TFunction): string {
  return t(`paymentsSettings.reviews.reasons.${reason}`);
}

export function formatPaymentReviewResolution(resolution: PaymentReviewResolution, t: TFunction): string {
  return t(`paymentsSettings.reviews.resolutions.${resolution}`);
}
