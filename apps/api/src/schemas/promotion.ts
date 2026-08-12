import { z } from 'zod';

export const PromotionDiscountTypeSchema = z.enum(['FIXED', 'PERCENTAGE']);
export const PromotionServiceScopeSchema = z.enum(['ALL', 'SELECTED']);
export const PromotionRedemptionStatusSchema = z.enum(['RESERVED', 'CONSUMED', 'RELEASED']);

export const PromotionCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(3).max(32),
  discountType: PromotionDiscountTypeSchema,
  fixedDiscountCents: z.coerce.number().int().min(1).optional().nullable(),
  percentageBasisPoints: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  appliesToPublicBookings: z.boolean().default(true),
  appliesToStaffBookings: z.boolean().default(true),
  maxActiveRedemptions: z.coerce.number().int().min(1).optional().nullable(),
  maxRedemptionsPerCustomer: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  minimumPriceCents: z.coerce.number().int().min(0).optional().nullable(),
  serviceScope: PromotionServiceScopeSchema.default('ALL'),
  serviceIds: z.array(z.string().trim().min(1)).max(200).optional(),
}).strict();

export const PromotionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  appliesToPublicBookings: z.boolean().optional(),
  appliesToStaffBookings: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const PromotionQuoteSchema = z.object({
  serviceId: z.string().trim().min(1),
  code: z.string().trim().min(1).max(32),
  clientPhone: z.string().trim().max(20).optional(),
}).strict();

export const PromotionRedemptionListQuerySchema = z.object({
  status: PromotionRedemptionStatusSchema.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type PromotionCreateInput = z.infer<typeof PromotionCreateSchema>;
export type PromotionUpdateInput = z.infer<typeof PromotionUpdateSchema>;
export type PromotionQuoteInput = z.infer<typeof PromotionQuoteSchema>;
export type PromotionRedemptionListQuery = z.infer<typeof PromotionRedemptionListQuerySchema>;
