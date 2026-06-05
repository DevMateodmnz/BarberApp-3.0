/**
 * Zod schemas for employee-service assignment requests
 */
import { z } from 'zod';

export const AssignServiceSchema = z
  .object({
    serviceId: z.string().min(1, 'Service ID is required'),
  })
  .strict();

export type AssignServiceInput = z.infer<typeof AssignServiceSchema>;
