import { z } from 'zod';
import { ServiceRecordDateSchema } from './serviceRecord.js';

export const PublicBarberQuerySchema = z.object({
  serviceId: z.string().trim().min(1, 'serviceId is required'),
}).strict();

export const PublicAvailabilityQuerySchema = z.object({
  serviceId: z.string().trim().min(1, 'serviceId is required'),
  localDate: ServiceRecordDateSchema,
}).strict();

export type PublicBarberQuery = z.infer<typeof PublicBarberQuerySchema>;
export type PublicAvailabilityQuery = z.infer<typeof PublicAvailabilityQuerySchema>;
