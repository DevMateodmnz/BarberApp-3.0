/**
 * Zod schemas for employee-related requests
 */
import { z } from 'zod';

export const CreateEmployeeSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => !!data.userId !== !!data.email, {
    message: 'Provide exactly one of: userId or email',
  });

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
