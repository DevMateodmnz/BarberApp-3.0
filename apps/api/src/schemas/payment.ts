import { z } from 'zod';

export const UpdateDepositPolicySchema = z.object({
  mode: z.enum(['DISABLED', 'FIXED', 'PERCENTAGE']),
  fixedAmountCents: z.number().int().positive().nullable().optional(),
  percentageBasisPoints: z.number().int().positive().max(10000).nullable().optional(),
  holdDurationMinutes: z.number().int().min(5).max(30),
  publicTerms: z.string().trim().max(1000).nullable().optional(),
}).strict();

export const PaymentConnectSchema = z.object({
  redirectTarget: z.string().trim().max(500).optional(),
}).strict();

export const PaymentListQuerySchema = z.object({
  status: z
    .enum(['CREATING', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REVIEW_REQUIRED', 'ERROR'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PaymentReviewListQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  reason: z.enum([
    'APPROVED_AFTER_HOLD_EXPIRY',
    'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
    'AMOUNT_MISMATCH',
    'CURRENCY_MISMATCH',
    'SELLER_MISMATCH',
    'EXTERNAL_REFERENCE_MISMATCH',
    'PREFERENCE_MISMATCH',
    'DUPLICATE_PROVIDER_PAYMENT',
    'PROVIDER_RECONCILIATION_ERROR',
    'OTHER',
  ]).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['newest', 'oldest', 'amount']).default('newest'),
}).strict();

export const PaymentReviewNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
}).strict();

export const PaymentReviewResolveSchema = z.object({
  resolution: z.enum([
    'REFUNDED_EXTERNALLY',
    'NO_REFUND_REQUIRED',
    'CUSTOMER_CREDIT_GRANTED',
    'PAYMENT_ACCEPTED_MANUALLY',
    'DUPLICATE_RESOLVED',
    'OTHER',
  ]),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const PaymentReviewReopenSchema = z.object({
  note: z.string().trim().max(1000).optional(),
}).strict();

export type UpdateDepositPolicyInput = z.infer<typeof UpdateDepositPolicySchema>;
export type PaymentConnectInput = z.infer<typeof PaymentConnectSchema>;
export type PaymentListQueryInput = z.infer<typeof PaymentListQuerySchema>;
export type PaymentReviewListQueryInput = z.infer<typeof PaymentReviewListQuerySchema>;
