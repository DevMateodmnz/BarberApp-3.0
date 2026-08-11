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
import {
  getLatestBookingPaymentForAppointment,
  createCheckoutPreferenceForBookingPayment,
  loadPublicBookingPaymentStateByReference,
  releaseExpiredPaymentHolds,
  syncBookingPaymentOnAppointmentCancellation,
} from './payments/bookingPaymentService.js';
import { getDepositPolicyPreviewForService } from './payments/depositPolicyService.js';
import { generatePaymentExternalReference } from '../lib/payments/references.js';
import type { PaymentRuntimeConfig } from '../lib/payments/runtime.js';
import {
  createPromotionRedemption,
  evaluatePromotion,
  findCustomerIdByPhone,
  PUBLIC_PROMOTION_UNAVAILABLE_CODE,
  releaseReservedPromotionRedemptionForAppointment,
} from './promotionService.js';

type PublicBookingConfirmationDto = Awaited<
  ReturnType<typeof loadPublicBookingPaymentStateByReference>
>;

interface CreatePublicBookingInput {
  slug: string;
  body: PublicCreateAppointmentInput;
  idempotencyKey: string;
  now?: Date;
  paymentRuntime?: PaymentRuntimeConfig;
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
      barbershop: { select: { publicSlug: true } },
    },
  });

  if (!appointment?.publicReference || !appointment.barbershop.publicSlug) {
    throw new AppError(
      409,
      'PUBLIC_BOOKING_IDEMPOTENCY_CONFLICT',
      'The stored public booking replay record is incomplete'
    );
  }

  return loadPublicBookingPaymentStateByReference({
    slug: appointment.barbershop.publicSlug,
    publicReference: appointment.publicReference,
  });
}

export async function getPublicBookingConfirmationByReference(input: {
  slug: string;
  publicReference: string;
}): Promise<PublicBookingConfirmationDto> {
  if (!isPublicBookingReference(input.publicReference.trim())) {
    throw createPublicNotFoundError();
  }
  return loadPublicBookingPaymentStateByReference({
    slug: input.slug,
    publicReference: input.publicReference.trim(),
  });
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
    promotionCode: input.body.promotionCode?.trim().toUpperCase() ?? '',
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
      await releaseExpiredPaymentHolds({ now, employeeId: employee.id });

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

      const promotionEvaluation = input.body.promotionCode?.trim()
        ? await evaluatePromotion(tx, {
            barbershopId: barbershop.id,
            code: input.body.promotionCode,
            serviceId: service.id,
            servicePriceCents: service.priceCents,
            bookingChannel: 'PUBLIC',
            customerId: customerRow.id,
            now,
            publicSafe: true,
          })
        : null;

      if (promotionEvaluation && !promotionEvaluation.eligible) {
        throw new AppError(409, PUBLIC_PROMOTION_UNAVAILABLE_CODE, 'Promotion not available');
      }

      const pricing = promotionEvaluation && promotionEvaluation.eligible
        ? promotionEvaluation
        : {
            servicePriceCents: service.priceCents,
            discountCents: 0,
            finalPriceCents: service.priceCents,
          };

      const depositPreview = await getDepositPolicyPreviewForService({
        barbershopId: barbershop.id,
        servicePriceCents: pricing.finalPriceCents,
        paymentRuntime: input.paymentRuntime,
      });

      const requiresDeposit = depositPreview.enabled && pricing.finalPriceCents > 0;

      const publicReference = generatePublicBookingReference();
      const holdExpiresAt = requiresDeposit
        ? new Date(now.getTime() + depositPreview.holdDurationMinutes * 60_000)
        : null;

      const appointment = await tx.appointment.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          clientId: null,
          customerId: customerRow.id,
          serviceId: service.id,
          startAt,
          endAt,
          status: requiresDeposit ? 'PENDING' : 'CONFIRMED',
          paymentHoldExpiresAt: holdExpiresAt,
          clientName,
          clientPhone,
          clientEmail,
          clientPhoneNormalized: clientPhone,
          publicReference,
          publicConsentAcceptedAt: now,
          publicConsentVersion: consent.version,
          notes,
          ...buildServiceSnapshot(service, pricing),
        },
      });

      if (promotionEvaluation && promotionEvaluation.eligible) {
        await createPromotionRedemption(tx, {
          promotionEvaluation,
          barbershopId: barbershop.id,
          appointmentId: appointment.id,
          customerId: customerRow.id,
          status: requiresDeposit ? 'RESERVED' : 'CONSUMED',
          now,
        });
      }

      if (!requiresDeposit) {
        await scheduleAppointmentNotificationsForNewAppointment(tx, {
          appointmentId: appointment.id,
          now,
        });
      }

      const bookingPayment = requiresDeposit
        ? await tx.bookingPayment.create({
            data: {
              barbershopId: barbershop.id,
              appointmentId: appointment.id,
              provider: 'MERCADO_PAGO',
              purpose: 'DEPOSIT',
              status: 'CREATING',
              amountCents: depositPreview.amountCents!,
              currency: depositPreview.currency,
              policyModeSnapshot: depositPreview.mode,
              policyValueSnapshot:
                depositPreview.mode === 'FIXED'
                  ? depositPreview.amountCents!
                  : Math.round((depositPreview.amountCents! * 10_000) / pricing.finalPriceCents),
              externalReference: generatePaymentExternalReference(),
              expiresAt: holdExpiresAt!,
            },
          })
        : null;

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
        appointmentId: appointment.id,
        publicReference,
        bookingPaymentId: bookingPayment?.id ?? null,
      };
    });

    if (result.bookingPaymentId) {
      try {
        await createCheckoutPreferenceForBookingPayment({
          bookingPaymentId: result.bookingPaymentId,
          publicReference: result.publicReference,
          barbershopSlug: barbershop.slug,
        });
      } catch (error) {
        await prisma.$transaction(async (tx) => {
          await tx.bookingPayment.update({
            where: { id: result.bookingPaymentId! },
            data: {
              status: 'ERROR',
              lastErrorCode:
                error instanceof AppError ? error.code : 'PAYMENT_PREFERENCE_FAILED',
            },
          });
          await tx.appointment.update({
            where: { id: result.appointmentId },
            data: {
              status: 'CANCELLED',
              paymentHoldExpiresAt: null,
              ...buildLifecycleUpdateForCancel({
                actorRole: null,
                source: 'SYSTEM',
                now,
                reason: 'PAYMENT_PREFERENCE_FAILED',
              }),
            },
          });
          await releaseReservedPromotionRedemptionForAppointment(tx, {
            appointmentId: result.appointmentId,
            reason: 'PREFERENCE_CREATION_FAILED',
            now,
          });
        });
        throw error;
      }
    }

    return {
      replayed: result.replayed,
      confirmation: await loadPublicAppointmentConfirmation(result.appointmentId),
    };
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

export async function quotePublicPromotionBySlug(input: {
  slug: string;
  serviceId: string;
  code: string;
  clientPhone?: string;
}) {
  const barbershop = await resolvePublishedPublicBarbershop(input.slug);
  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
    },
  });
  if (!service) {
    throw createPublicNotFoundError();
  }
  const normalizedPhone = input.clientPhone?.trim()
    ? normalizePublicBookingPhone(input.clientPhone)
    : null;
  const customerId = await findCustomerIdByPhone(barbershop.id, normalizedPhone);
  const evaluation = await evaluatePromotion(prisma, {
    barbershopId: barbershop.id,
    code: input.code,
    serviceId: service.id,
    servicePriceCents: service.priceCents,
    bookingChannel: 'PUBLIC',
    customerId,
    now: new Date(),
    publicSafe: true,
  });

  if (!evaluation.eligible) {
    throw new AppError(409, PUBLIC_PROMOTION_UNAVAILABLE_CODE, 'Promotion not available');
  }

  const depositPreview = await getDepositPolicyPreviewForService({
    barbershopId: barbershop.id,
    servicePriceCents: evaluation.finalPriceCents,
  });

  return {
    promotionName: evaluation.promotion.name,
    servicePriceCents: evaluation.servicePriceCents,
    discountCents: evaluation.discountCents,
    finalPriceCents: evaluation.finalPriceCents,
    currency: service.currency,
    depositAmountCents: evaluation.finalPriceCents > 0 ? depositPreview.amountCents : null,
    remainingAmountCents: evaluation.finalPriceCents > 0 ? depositPreview.remainingAmountCents : 0,
  };
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
    paymentStatus?:
      | 'CREATING'
      | 'PENDING'
      | 'APPROVED'
      | 'REJECTED'
      | 'CANCELLED'
      | 'EXPIRED'
      | 'REFUNDED'
      | 'REVIEW_REQUIRED'
      | 'ERROR'
      | null;
    refundReviewRequired?: boolean;
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

    const latestPayment = await getLatestBookingPaymentForAppointment(
      diagnostic.id,
      tx
    );
    const allowPendingCancellation =
      diagnostic.status === 'PENDING' &&
      latestPayment !== null &&
      ['CREATING', 'PENDING', 'ERROR', 'REJECTED', 'CANCELLED'].includes(
        latestPayment.status
      );
    const cancellableStatuses: Array<'CONFIRMED' | 'PENDING'> =
      allowPendingCancellation ? ['CONFIRMED', 'PENDING'] : ['CONFIRMED'];

    // 2. The atomic CAS. PostgreSQL evaluates the predicate and
    //    the SET atomically: the only writer that can succeed is
    //    the one that finds an eligible future booking state.
    const updated = await tx.appointment.updateMany({
      where: {
        id: diagnostic.id,
        status: { in: cancellableStatuses },
        startAt: { gt: now },
      },
      data: {
        status: 'CANCELLED',
        paymentHoldExpiresAt: null,
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
        currentStatus !== 'CONFIRMED' && currentStatus !== 'PENDING'
          ? `This booking is ${currentStatus.toLowerCase()} and cannot be cancelled by the customer`
          : 'This booking can no longer be cancelled because it has already started'
      );
    }

    // 3. CAS won. Read back the full row (still inside the
    //    transaction) so the response is consistent.
    const paymentSync = await syncBookingPaymentOnAppointmentCancellation({
      appointmentId: diagnostic.id,
      barbershopId: diagnostic.barbershopId,
      now,
      reasonCode: 'APPOINTMENT_CANCELLED_BY_PUBLIC_BOOKING',
      db: tx,
    });

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
        paymentHoldExpiresAt: true,
      },
    }).then((appointment) => ({
      ...appointment,
      paymentStatus: paymentSync.latestPaymentStatus,
      refundReviewRequired: paymentSync.reviewRequired,
    }));
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
      paymentStatus: cancelled.paymentStatus ?? null,
      refundReviewRequired: cancelled.refundReviewRequired ?? false,
    },
  };
}
