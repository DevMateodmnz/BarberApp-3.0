import { z } from 'zod';

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const UpdateCommissionSettingsSchema = z.object({
  defaultPercentageBasisPoints: z.number().int().min(0).max(10_000),
  employeeOverrides: z.array(z.object({
    employeeId: z.string().min(1),
    percentageBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  }).strict()).max(200),
}).strict();

export const CommissionRangeQuerySchema = z.object({
  employeeId: z.string().min(1).optional(),
  dateFrom: LocalDateSchema,
  dateTo: LocalDateSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const CreateLiquidationSchema = z.object({
  employeeId: z.string().min(1),
  dateFrom: LocalDateSchema,
  dateTo: LocalDateSchema,
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export const VoidLiquidationSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();

export type UpdateCommissionSettingsInput = z.infer<typeof UpdateCommissionSettingsSchema>;
export type CommissionRangeQuery = z.infer<typeof CommissionRangeQuerySchema>;
export type CreateLiquidationInput = z.infer<typeof CreateLiquidationSchema>;
