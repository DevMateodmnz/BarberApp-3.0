import { z } from 'zod';

export const NotificationOperationsSortSchema = z.enum([
  'newest',
  'scheduled',
  'failed',
]);

export const NotificationOperationsQuerySchema = z
  .object({
    status: z
      .enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'])
      .optional(),
    type: z.enum(['BOOKING_CONFIRMATION', 'REMINDER_24H']).optional(),
    channel: z.enum(['EMAIL']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: NotificationOperationsSortSchema.default('newest'),
  })
  .strict()
  .refine(
    (value) => {
      if (!value.dateFrom || !value.dateTo) {
        return true;
      }

      return new Date(value.dateFrom).getTime() <= new Date(value.dateTo).getTime();
    },
    {
      message: 'dateFrom must be less than or equal to dateTo',
      path: ['dateFrom'],
    }
  );

export const NotificationRetryBodySchema = z
  .object({})
  .strict();

export type NotificationOperationsQuery = z.infer<
  typeof NotificationOperationsQuerySchema
>;
