import { z } from 'zod';

/**
 * Validates a date string in strict YYYY-MM-DD format.
 * Rejects non-zero-padded strings (2026-6-6), invalid months (2026-13-01),
 * and impossible dates (2026-02-30).
 */
export const ServiceRecordDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((val) => {
    const [y, m, d] = val.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, 'Date must be a valid calendar date');

export const SummaryPeriodSchema = z.enum(['today', 'week', 'month', 'year']);

export const CreateServiceRecordSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  serviceId: z.string().min(1, 'Service ID is required'),
  priceCents: z.number().int().min(0, 'Price must be a non-negative integer'),
  performedAt: z.string().datetime().optional(),
  clientName: z.string().max(200).optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  notes: z.string().max(1000).optional(),
}).strict();

export type CreateServiceRecordInput = z.infer<typeof CreateServiceRecordSchema>;
export type SummaryPeriod = z.infer<typeof SummaryPeriodSchema>;
