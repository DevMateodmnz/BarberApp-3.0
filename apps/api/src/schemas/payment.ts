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

export type UpdateDepositPolicyInput = z.infer<typeof UpdateDepositPolicySchema>;
export type PaymentConnectInput = z.infer<typeof PaymentConnectSchema>;
export type PaymentListQueryInput = z.infer<typeof PaymentListQuerySchema>;
