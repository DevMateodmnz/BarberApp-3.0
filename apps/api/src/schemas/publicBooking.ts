import { z } from 'zod';
import {
  PUBLIC_BOOKING_CLIENT_NAME_MAX_LENGTH,
  PUBLIC_BOOKING_NOTES_MAX_LENGTH,
} from '../lib/publicBookingInput.js';

const OptionalPublicBookingEmailSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  },
  z.string().trim().email('clientEmail must be a valid email').max(200).optional()
);

export const PublicCreateAppointmentSchema = z
  .object({
    serviceId: z.string().trim().min(1, 'serviceId is required'),
    barberId: z.string().trim().min(1, 'barberId is required'),
    startAt: z
      .string()
      .trim()
      .datetime({
        offset: true,
        message: 'startAt must be ISO 8601 datetime',
      })
      .refine(
        (value) => value.endsWith('Z'),
        'startAt must be a UTC timestamp with a Z suffix'
      ),
    clientName: z
      .string()
      .trim()
      .min(1, 'clientName is required')
      .max(PUBLIC_BOOKING_CLIENT_NAME_MAX_LENGTH),
    clientPhone: z.string().trim().min(1, 'clientPhone is required').max(16),
    clientEmail: OptionalPublicBookingEmailSchema,
    promotionCode: z.string().trim().max(32).optional(),
    notes: z.string().trim().max(PUBLIC_BOOKING_NOTES_MAX_LENGTH).optional(),
    consentAccepted: z
      .boolean()
      .refine((value) => value === true, 'consentAccepted must be true'),
    consentVersion: z.string().trim().min(1, 'consentVersion is required'),
  })
  .strict();

export const PublicPromotionQuoteSchema = z
  .object({
    serviceId: z.string().trim().min(1, 'serviceId is required'),
    code: z.string().trim().min(1, 'code is required').max(32),
    clientPhone: z.string().trim().max(20).optional(),
  })
  .strict();

/**
 * Body for POST /api/v1/public/barbershops/:slug/appointments/:reference/cancel
 *
 * Reason is optional and trimmed; empty/whitespace reasons are stored as NULL.
 * Body is fully optional so the customer can cancel without typing a reason.
 */
export const PublicCancelBookingSchema = z.preprocess(
  (value) => (value === null || value === undefined ? {} : value),
  z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .strict()
);

export type PublicCreateAppointmentInput = z.infer<
  typeof PublicCreateAppointmentSchema
>;
export type PublicCancelBookingInput = z.infer<typeof PublicCancelBookingSchema>;
export type PublicPromotionQuoteInput = z.infer<typeof PublicPromotionQuoteSchema>;
