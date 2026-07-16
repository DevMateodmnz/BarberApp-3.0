import { z } from 'zod';

export const LoyaltyProgramUpdateSchema = z.object({
  isEnabled: z.boolean(),
  visitsRequired: z.coerce.number().int().min(2).max(20),
  rewardPromotionId: z.string().trim().min(1).nullable().optional(),
  rewardValidityDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
}).strict();

export const LoyaltyLedgerListQuerySchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const LoyaltyAdminAdjustmentSchema = z.object({
  stampDelta: z.coerce.number().int().refine((value) => value !== 0, 'stampDelta must be non-zero'),
  reason: z.string().trim().min(1).max(500),
}).strict();

export type LoyaltyProgramUpdateInput = z.infer<typeof LoyaltyProgramUpdateSchema>;
export type LoyaltyLedgerListQuery = z.infer<typeof LoyaltyLedgerListQuerySchema>;
export type LoyaltyAdminAdjustmentInput = z.infer<typeof LoyaltyAdminAdjustmentSchema>;
