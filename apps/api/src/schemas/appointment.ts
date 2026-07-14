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

export const AppointmentListQuerySchema = z
  .object({
    date: ServiceRecordDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
    offset: z.coerce.number().int().min(0).default(0),
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

/**
 * Body for DELETE /api/v1/appointments/:id
 * Reason is optional and trimmed; empty/whitespace reasons are stored as NULL
 * by the service. Body is fully optional so callers can cancel without
 * sending a payload.
 */
export const CancelAppointmentBodySchema = z.preprocess(
  (value) => (value === null || value === undefined ? {} : value),
  z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .strict()
);

export const CustomerLookupQuerySchema = z
  .object({
    phone: z
      .string()
      .trim()
      .min(1, 'phone is required')
      .max(20)
      .regex(/^\+[1-9]\d{7,19}$/u, 'phone must be a canonical E.164 number'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type StaffCreateAppointmentInput = z.infer<
  typeof StaffCreateAppointmentSchema
>;
export type AppointmentAvailabilityQuery = z.infer<
  typeof AppointmentAvailabilityQuerySchema
>;
export type AppointmentListQuery = z.infer<typeof AppointmentListQuerySchema>;
export type CancelAppointmentBody = z.infer<typeof CancelAppointmentBodySchema>;
export type CustomerLookupQuery = z.infer<typeof CustomerLookupQuerySchema>;
