import { Prisma } from '@prisma/client';
import { AppError, ValidationError } from '../lib/errors.js';
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
import {
  generatePublicBookingReference,
  isPublicBookingReference,
} from '../lib/publicBookingReference.js';
import { getPublicBookingPolicy } from '../lib/publicBookingPolicy.js';
import {
  getLocalDateStringInTimeZone,
  getLocalTimeStringInTimeZone,
} from '../lib/dateUtils.js';
import { buildLifecycleUpdateForCancel } from '../lib/appointmentLifecycle.js';
import * as customerService from './customerService.js';
import type { PublicCreateAppointmentInput } from '../schemas/publicBooking.js';
import {
  buildServiceSnapshot,
  calculateAppointmentEndAt,
  hasTimeConflict,
  validateAppointmentStartAt,
} from './appointmentService.js';
import {
  cancelAppointmentNotifications,
  scheduleAppointmentNotificationsForNewAppointment,
} from './appointmentNotificationService.js';
import { normalizeEmail } from '../lib/email.js';
import { resolvePublishedPublicBarbershop } from './publicCatalogService.js';
import { validateEmployeeAvailabilityWindow } from './employeeScheduleService.js';

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
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'IN_PROGRESS' | 'PENDING';
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

function isPrivateAvailabilityError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (
      error.code === 'BARBERSHOP_CLOSED' ||
      error.code === 'EMPLOYEE_TIME_OFF' ||
      error.code === 'EMPLOYEE_NOT_WORKING' ||
      error.code === 'EMPLOYEE_SCHEDULE_CONFLICT'
    )
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

function mapPublicAppointmentConfirmation(appointment: {
  publicReference: string | null;
  clientPhone: string | null;
  status: PublicBookingConfirmationDto['status'];
  startAt: Date;
  endAt: Date;
  serviceName: string;
  barbershop: {
    name: string;
    timezone: string;
  };
  employee: {
    user: {
      name: string | null;
    };
  };
}): PublicBookingConfirmationDto {
  if (!appointment.publicReference) {
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
    status: appointment.status,
  };
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

  if (!appointment || appointment.status !== 'CONFIRMED') {
    throw new AppError(
      409,
      'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
      'The stored public booking replay record is incomplete'
    );
  }

  return mapPublicAppointmentConfirmation(appointment);
}

export async function getPublicBookingConfirmationByReference(input: {
  slug: string;
  publicReference: string;
}): Promise<PublicBookingConfirmationDto> {
  const trimmedReference = input.publicReference.trim();

  if (!isPublicBookingReference(trimmedReference)) {
    throw createPublicNotFoundError();
  }

  const appointment = await prisma.appointment.findUnique({
    where: { publicReference: trimmedReference },
    select: {
      publicReference: true,
      clientPhone: true,
      status: true,
      startAt: true,
      endAt: true,
      serviceName: true,
      barbershop: {
        select: {
          publicSlug: true,
          isActive: true,
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

  if (
    !appointment ||
    !appointment.barbershop.publicSlug ||
    appointment.barbershop.publicSlug !== input.slug ||
    !appointment.barbershop.isActive
  ) {
    throw createPublicNotFoundError();
  }

  return mapPublicAppointmentConfirmation(appointment);
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
  const clientEmail = input.body.clientEmail?.trim()
    ? normalizeEmail(input.body.clientEmail)
    : null;
  const notes = normalizePublicBookingNotes(input.body.notes);
  const fingerprint = fingerprintPublicBookingRequest({
    barbershopId: barbershop.id,
    serviceId: input.body.serviceId,
    barberId: input.body.barberId,
    startAt: startAt.toISOString(),
    clientName,
    clientPhone,
    clientEmail,
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

      try {
        await validateEmployeeAvailabilityWindow({
          barbershopId: barbershop.id,
          employeeId: employee.id,
          startAt,
          endAt,
          timezone: barbershop.timezone,
          db: tx,
        });
      } catch (error) {
        if (isPrivateAvailabilityError(error)) {
          throw createPublicSlotUnavailableError();
        }

        throw error;
      }

      const conflict = await hasTimeConflict(employee.id, startAt, endAt, undefined, tx);
      if (conflict) {
        throw createPublicSlotUnavailableError();
      }

      // Link the appointment to a first-class Customer record.
      // Public booking input is already E.164, so the phone is
      // directly usable. The upsert is idempotent; two concurrent
      // public bookings for the same phone in the same barbershop
      // produce one customer.
      const { customer: customerRow } = await customerService.upsertCustomerByPhone(
        {
          barbershopId: barbershop.id,
          phone: clientPhone,
          name: clientName,
          email: clientEmail,
          appointmentAt: startAt,
          db: tx,
        }
      );

      const appointment = await tx.appointment.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          clientId: null,
          customerId: customerRow.id,
          serviceId: service.id,
          startAt,
          endAt,
          status: 'CONFIRMED',
          clientName,
          clientPhone,
          clientEmail,
          // Public booking input is already E.164 (validated upstream);
          // mirror it into the normalized column so the customer lookup
          // endpoint can aggregate public + staff history.
          clientPhoneNormalized: clientPhone,
          publicReference: generatePublicBookingReference(),
          publicConsentAcceptedAt: now,
          publicConsentVersion: consent.version,
          notes,
          ...buildServiceSnapshot(service),
        },
      });

      await scheduleAppointmentNotificationsForNewAppointment(tx, {
        appointmentId: appointment.id,
        now,
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

// ============================================
// PUBLIC CANCEL BY REFERENCE
// ============================================

interface CancelPublicBookingInput {
  slug: string;
  publicReference: string;
  reason?: string | null;
  now?: Date;
}

interface PublicCancelResult {
  appointment: {
    id: string;
    publicReference: string;
    status: 'CANCELLED';
    cancelledAt: string;
    cancellationSource: 'PUBLIC_BOOKING';
    cancelReason: string | null;
  };
}

/**
 * Cancels a public booking by reference. Intended for the anonymous
 * customer cancel flow that runs on the public-web confirmation page.
 *
 * Security model: the public reference is a bearer credential. Possession
 * of the reference authorizes cancellation of the matching booking.
 * To prevent a customer from "cancelling" a missed appointment
 * retroactively, the endpoint enforces a strict future-start cutoff:
 * a row whose startAt is <= now is no longer eligible for public
 * cancellation. The check, the existence/active-state/slug check, and
 * the state mutation all run in a single transaction with a serializable
 * read so a competing staff transition cannot interleave.
 *
 * Decoupled actor model: anonymous guests are not represented as a
 * fake "CLIENT" UserRole. Instead, the row is stamped with
 * `cancellationSource = 'PUBLIC_BOOKING'` and `cancelledByRole = NULL`.
 * This separation is also what enables future automated cancel jobs
 * (no-show sweeps, slot-expiration) without inventing more roles.
 *
 * Returns 404 when:
 * - the slug does not resolve to a published barbershop
 * - the reference does not match an appointment
 * - the reference belongs to a different barbershop
 *
 * Returns 409 when:
 * - the appointment is already in a terminal state
 * - the appointment has already started
 */
export async function cancelPublicBookingByReference(
  input: CancelPublicBookingInput
): Promise<PublicCancelResult> {
  const trimmedReference = input.publicReference.trim();
  const now = input.now ?? new Date();

  if (!isPublicBookingReference(trimmedReference)) {
    throw createPublicNotFoundError();
  }

  // Compare-and-swap on the source state and the future-start
  // cutoff in a single atomic updateMany. PostgreSQL evaluates
  // the WHERE predicate and the SET atomically: a concurrent
  // staff cancel or no-show sweep that wins the race leaves the
  // row in a terminal or non-CONFIRMED state, and our update
  // returns count = 0. The 404 vs 409 vs ALREADY_TERMINAL
  // distinction is then resolved by a follow-up read inside the
  // same transaction.
  const lifecycleUpdate = buildLifecycleUpdateForCancel({
    actorRole: null,
    source: 'PUBLIC_BOOKING',
    now,
    reason: input.reason,
  });

  const casResult = await prisma.$transaction(async (tx) => {
    // 1. Existence + slug check on the row. If the row does not
    //    exist, has the wrong slug, or its shop is inactive, we
    //    never want the CAS to match — so we return early with a
    //    404 without ever attempting the update.
    const diagnostic = await tx.appointment.findUnique({
      where: { publicReference: trimmedReference },
      select: {
        id: true,
        barbershopId: true,
        status: true,
        startAt: true,
        barbershop: { select: { publicSlug: true, isActive: true } },
      },
    });

    if (!diagnostic) {
      throw createPublicNotFoundError();
    }

    if (
      !diagnostic.barbershop.publicSlug ||
      diagnostic.barbershop.publicSlug !== input.slug ||
      !diagnostic.barbershop.isActive
    ) {
      throw createPublicNotFoundError();
    }

    // 2. The atomic CAS. PostgreSQL evaluates the predicate and
    //    the SET atomically: the only writer that can succeed is
    //    the one that finds status='CONFIRMED' AND startAt > now.
    const updated = await tx.appointment.updateMany({
      where: {
        id: diagnostic.id,
        status: 'CONFIRMED',
        startAt: { gt: now },
      },
      data: {
        status: 'CANCELLED',
        ...lifecycleUpdate,
      },
    });

    if (updated.count === 0) {
      // The CAS lost the race. Read the current state to decide
      // between ALREADY_TERMINAL (the row is now terminal) and
      // CANCELLATION_CLOSED (the row is still active but the
      // future-start window has closed or the status is not
      // CONFIRMED).
      const current = await tx.appointment.findUnique({
        where: { id: diagnostic.id },
        select: { status: true, startAt: true },
      });
      const currentStatus = current?.status ?? diagnostic.status;
      if (
        currentStatus === 'CANCELLED' ||
        currentStatus === 'COMPLETED' ||
        currentStatus === 'NO_SHOW'
      ) {
        throw new AppError(
          409,
          'PUBLIC_BOOKING_ALREADY_TERMINAL',
          `This booking is already ${currentStatus.toLowerCase()} and cannot be cancelled`
        );
      }
      throw new AppError(
        409,
        'PUBLIC_BOOKING_CANCELLATION_CLOSED',
        currentStatus !== 'CONFIRMED'
          ? `This booking is ${currentStatus.toLowerCase()} and cannot be cancelled by the customer`
          : 'This booking can no longer be cancelled because it has already started'
      );
    }

    // 3. CAS won. Read back the full row (still inside the
    //    transaction) so the response is consistent.
    await cancelAppointmentNotifications(tx, {
      appointmentId: diagnostic.id,
      barbershopId: diagnostic.barbershopId,
      types: ['BOOKING_CONFIRMATION', 'REMINDER_24H'],
      now,
    });

    return tx.appointment.findUniqueOrThrow({
      where: { id: diagnostic.id },
      select: {
        id: true,
        publicReference: true,
        status: true,
        cancelledAt: true,
        cancellationSource: true,
        cancelReason: true,
      },
    });
  });

  if (!casResult.publicReference) {
    throw new AppError(
      409,
      'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
      'The stored public booking replay record is incomplete'
    );
  }

  // Rename the local so the rest of the function reads naturally.
  const cancelled = casResult;

  if (!cancelled.publicReference) {
    throw new AppError(
      409,
      'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
      'The stored public booking replay record is incomplete'
    );
  }

  return {
    appointment: {
      id: cancelled.id,
      publicReference: cancelled.publicReference,
      status: 'CANCELLED',
      cancelledAt: (cancelled.cancelledAt as Date).toISOString(),
      cancellationSource: 'PUBLIC_BOOKING',
      cancelReason: cancelled.cancelReason,
    },
  };
}
