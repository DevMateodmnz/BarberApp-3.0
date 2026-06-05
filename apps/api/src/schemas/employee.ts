/**
 * Zod schemas for employee-related requests
 */
import { z } from 'zod';

export const CreateEmployeeSchema = z
  .object({
    userId: z.string().min(1, 'User ID is required'),
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
