/**
 * Zod schemas for appointment-related requests
 */
import { z } from 'zod';
import { ServiceRecordDateSchema } from './serviceRecord.js';

export const CreateAppointmentSchema = z
  .object({
    barbershopId: z.string().min(1, 'Barbershop ID is required'),
    employeeId: z.string().min(1, 'Employee ID is required'),
    serviceId: z.string().min(1, 'Service ID is required'),
    startAt: z.string().datetime({ message: 'startAt must be ISO 8601 datetime' }),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const UpdateAppointmentSchema = z
  .object({
    startAt: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const StaffCreateAppointmentSchema = z
  .object({
    employeeId: z.string().min(1, 'Employee ID is required').optional(),
    serviceId: z.string().min(1, 'Service ID is required'),
    startAt: z.string().datetime({ message: 'startAt must be ISO 8601 datetime' }),
    clientName: z.string().trim().min(1, 'Client name is required').max(200),
    clientPhone: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const AppointmentAvailabilityQuerySchema = z
  .object({
    serviceId: z.string().min(1, 'Service ID is required'),
    localDate: ServiceRecordDateSchema,
  })
  .strict();

export const AppointmentStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ]),
});

export const AppointmentParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type StaffCreateAppointmentInput = z.infer<
  typeof StaffCreateAppointmentSchema
>;
export type AppointmentAvailabilityQuery = z.infer<
  typeof AppointmentAvailabilityQuerySchema
>;
