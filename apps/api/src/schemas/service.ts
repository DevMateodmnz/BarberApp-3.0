/**
 * Zod schemas for service-related requests
 */
import { z } from 'zod';

export const CreateServiceSchema = z
  .object({
    name: z.string().min(1, 'Service name is required'),
    durationMinutes: z.number().int().positive('Duration must be a positive integer'),
    priceCents: z.number().int().min(0, 'Price must be a non-negative integer'),
    description: z.string().optional(),
  })
  .strict();

export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;
