import { Prisma } from '@prisma/client';
import { AppError, ValidationError } from '../lib/errors.js';
import { validateBusinessHours } from '../lib/businessHours.js';
import { validateAvailabilityDateRange } from '../lib/availabilitySlots.js';
import { getPublicBookingConsent } from '../lib/publicBookingConsent.js';
import {
  PUBLIC_BOOKING_CREATE_OPERATION,
  fingerprintPublicBookingRequest,
  validatePublicBookingIdempotencyKey,
} from '../lib/publicBookingIdempotency.js';
import {
  normalizePublicBookingClientName,
  normalizePublicBookingNotes,
} from '../lib/publicBookingInput.js';
import { normalizePublicBookingPhone } from '../lib/publicBookingPhone.js';
import { prisma } from '../lib/prisma.js';
import { generatePublicBookingReference } from '../lib/publicBookingReference.js';
import { getPublicBookingPolicy } from '../lib/publicBookingPolicy.js';
import {
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
} from '../lib/dateUtils.js';
import type { PublicCreateAppointmentInput } from '../schemas/publicBooking.js';
import {
  buildServiceSnapshot,
  calculateAppointmentEndAt,
  hasTimeConflict,
  validateAppointmentStartAt,
} from './appointmentService.js';
import { resolvePublishedPublicBarbershop } from './publicCatalogService.js';

interface PublicBookingConfirmationDto {
  bookingReference: string;
  barbershopName: string;
  serviceName: string;
  barberName: string;
  timezone: string;
  localDate: string;
  localStartTime: string;
  startAt: string;
  endAt: string;
  clientPhoneDisplay: string;
  status: 'CONFIRMED';
}

interface CreatePublicBookingInput {
  slug: string;
  body: PublicCreateAppointmentInput;
  idempotencyKey: string;
  now?: Date;
}

function createPublicNotFoundError(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Public resource not found');
}

function createPublicSlotUnavailableError(): AppError {
  return new AppError(
    409,
    'PUBLIC_BOOKING_SLOT_UNAVAILABLE',
    'This time slot is no longer available'
  );
}

function resolvePublicBarberDisplayName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Barber';
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function normalizePublicBookingStartAt(value: string): Date {
  const trimmed = value.trim();

  if (!trimmed.endsWith('Z')) {
    throw new ValidationError('startAt must be a UTC timestamp with a Z suffix');
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('startAt must be a valid ISO 8601 datetime');
  }

  return parsed;
}

async function loadPublicAppointmentConfirmation(
  appointmentId: string
): Promise<PublicBookingConfirmationDto> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      publicReference: true,
      clientPhone: true,
      status: true,
      startAt: true,
      endAt: true,
      serviceName: true,
      barbershop: {
        select: {
          name: true,
          timezone: true,
        },
      },
      employee: {
        select: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!appointment?.publicReference || appointment.status !== 'CONFIRMED') {
    throw new AppError(
      409,
      'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
      'The stored public booking replay record is incomplete'
    );
  }

  return {
    bookingReference: appointment.publicReference,
    barbershopName: appointment.barbershop.name,
    serviceName: appointment.serviceName,
    barberName: resolvePublicBarberDisplayName(appointment.employee.user.name),
    timezone: appointment.barbershop.timezone,
    localDate: getLocalDateStringInTimeZone(
      appointment.barbershop.timezone,
      appointment.startAt
    ),
    localStartTime: getLocalTimeStringInTimeZone(
      appointment.barbershop.timezone,
      appointment.startAt
    ),
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    clientPhoneDisplay: appointment.clientPhone ?? '',
    status: 'CONFIRMED',
  };
}

export async function createPublicBookingBySlug(
  input: CreatePublicBookingInput
): Promise<{ replayed: boolean; confirmation: PublicBookingConfirmationDto }> {
  const now = input.now ?? new Date();
  const idempotencyKey = validatePublicBookingIdempotencyKey(
    input.idempotencyKey
  );
  const consent = getPublicBookingConsent();
  const policy = getPublicBookingPolicy();
  const barbershop = await resolvePublishedPublicBarbershop(input.slug);

  if (input.body.consentVersion !== consent.version) {
    throw new AppError(
      400,
      'INVALID_PUBLIC_BOOKING_CONSENT',
      'consentVersion does not match the current public booking consent'
    );
  }

  const startAt = normalizePublicBookingStartAt(input.body.startAt);
  const localDate = getLocalDateStringInTimeZone(barbershop.timezone, startAt);

  validateAvailabilityDateRange(localDate, barbershop.timezone, now, {
    allowTodayOnlyOrFuture: true,
    maximumBookingHorizonDays: policy.maximumBookingHorizonDays,
    invalidPastCode: 'INVALID_APPOINTMENT_DATE',
    invalidPastMessage: 'Public booking cannot be requested for a past date',
    invalidHorizonCode: 'INVALID_APPOINTMENT_DATE',
    invalidHorizonMessage:
      'Public booking cannot be requested beyond the public booking horizon',
  });

  const clientName = normalizePublicBookingClientName(input.body.clientName);
  const clientPhone = normalizePublicBookingPhone(input.body.clientPhone);
  const notes = normalizePublicBookingNotes(input.body.notes);
  const fingerprint = fingerprintPublicBookingRequest({
    barbershopId: barbershop.id,
    serviceId: input.body.serviceId,
    barberId: input.body.barberId,
    startAt: startAt.toISOString(),
    clientName,
    clientPhone,
    notes,
    consentVersion: input.body.consentVersion,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.publicBookingIdempotency.create({
        data: {
          barbershopId: barbershop.id,
          operation: PUBLIC_BOOKING_CREATE_OPERATION,
          idempotencyKey,
          requestFingerprint: fingerprint,
          expiresAt: new Date(now.getTime() + 48 * 60 * 60_000),
        },
      });

      const service = await tx.service.findFirst({
        where: {
          id: input.body.serviceId,
          barbershopId: barbershop.id,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!service) {
        throw createPublicNotFoundError();
      }

      const employee = await tx.employee.findFirst({
        where: {
          id: input.body.barberId,
          barbershopId: barbershop.id,
          isActive: true,
          deletedAt: null,
          employeeServices: {
            some: {
              serviceId: service.id,
              service: {
                id: service.id,
                barbershopId: barbershop.id,
                isActive: true,
                deletedAt: null,
              },
            },
          },
        },
        select: {
          id: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!employee) {
        throw createPublicNotFoundError();
      }

      const minimumBookableAt = new Date(
        now.getTime() + policy.minimumNoticeMinutes * 60_000
      );

      validateAppointmentStartAt(startAt, barbershop.timezone, {
        now,
        minimumAllowedAt: minimumBookableAt,
        futureErrorMessage:
          'Appointments must respect the public booking minimum notice window',
        slotIntervalMinutes: policy.slotIntervalMinutes,
      });

      const endAt = calculateAppointmentEndAt(startAt, service.durationMinutes);

      await validateBusinessHours({
        barbershopId: barbershop.id,
        startAt,
        endAt,
      });

      const conflict = await hasTimeConflict(employee.id, startAt, endAt, undefined, tx);
      if (conflict) {
        throw createPublicSlotUnavailableError();
      }

      const appointment = await tx.appointment.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          clientId: null,
          serviceId: service.id,
          startAt,
          endAt,
          status: 'CONFIRMED',
          clientName,
          clientPhone,
          publicReference: generatePublicBookingReference(),
          publicConsentAcceptedAt: now,
          publicConsentVersion: consent.version,
          notes,
          ...buildServiceSnapshot(service),
        },
      });

      await tx.publicBookingIdempotency.update({
        where: {
          barbershopId_operation_idempotencyKey: {
            barbershopId: barbershop.id,
            operation: PUBLIC_BOOKING_CREATE_OPERATION,
            idempotencyKey,
          },
        },
        data: {
          appointmentId: appointment.id,
        },
      });

      return {
        replayed: false,
        confirmation: {
          bookingReference: appointment.publicReference ?? '',
          barbershopName: barbershop.name,
          serviceName: appointment.serviceName,
          barberName: resolvePublicBarberDisplayName(employee.user.name),
          timezone: barbershop.timezone,
          localDate,
          localStartTime: getLocalTimeStringInTimeZone(
            barbershop.timezone,
            startAt
          ),
          startAt: appointment.startAt.toISOString(),
          endAt: appointment.endAt.toISOString(),
          clientPhoneDisplay: clientPhone,
          status: 'CONFIRMED' as const,
        },
      };
    });

    return result;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.publicBookingIdempotency.findUnique({
        where: {
          barbershopId_operation_idempotencyKey: {
            barbershopId: barbershop.id,
            operation: PUBLIC_BOOKING_CREATE_OPERATION,
            idempotencyKey,
          },
        },
      });

      if (!existing) {
        throw error;
      }

      if (existing.requestFingerprint !== fingerprint) {
        throw new AppError(
          409,
          'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
          'Idempotency-Key has already been used with a different payload'
        );
      }

      if (!existing.appointmentId) {
        throw new AppError(
          409,
          'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
          'A public booking request with this Idempotency-Key is already in progress'
        );
      }

      return {
        replayed: true,
        confirmation: await loadPublicAppointmentConfirmation(existing.appointmentId),
      };
    }

    if (
      error instanceof Prisma.PrismaClientUnknownRequestError &&
      error.message.includes('no_double_booking')
    ) {
      throw createPublicSlotUnavailableError();
    }

    throw error;
  }
}
