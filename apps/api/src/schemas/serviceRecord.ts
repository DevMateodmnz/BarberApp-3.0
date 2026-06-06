import { z } from 'zod';

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
