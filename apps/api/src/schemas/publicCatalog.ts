import { z } from 'zod';

export const PublicBarberQuerySchema = z.object({
  serviceId: z.string().trim().min(1, 'serviceId is required'),
});

export type PublicBarberQuery = z.infer<typeof PublicBarberQuerySchema>;
