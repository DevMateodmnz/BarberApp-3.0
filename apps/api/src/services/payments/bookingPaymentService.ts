import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { buildLifecycleUpdateForCancel } from '../../lib/appointmentLifecycle.js';
import { decryptPaymentSecret, encryptPaymentSecret, timingSafeEqualHex } from '../../lib/payments/crypto.js';
import { readPaymentRuntimeConfig } from '../../lib/payments/runtime.js';
import { prisma } from '../../lib/prisma.js';
import { cancelAppointmentNotifications, scheduleAppointmentNotificationsForNewAppointment } from '../appointmentNotificationService.js';
import { getOperationalMercadoPagoCredentials } from './paymentConnectionService.js';
import { createMercadoPagoCheckoutPreference, getMercadoPagoPaymentById } from './providers/mercadoPagoClient.js';
import { ensurePaymentReviewCase, getOpenPaymentReviewForPayment, getPaymentTimelineForPayment, getProviderEventSummariesForPayment } from './paymentReviewService.js';
import { consumeReservedPromotionRedemptionForAppointment, releaseReservedPromotionRedemptionForAppointment } from '../promotionService.js';

const runtime = readPaymentRuntimeConfig(process.env);
const MAX_WEBHOOK_SIGNATURE_HEADER_LENGTH = 512;

export interface PublicBookingPaymentStateDto {
  bookingReference: string;
  barbershopName: string;
  serviceName: string;
  barberName: string;
  timezone: string;
  localDate: string;
  localStartTime: string;
  startAt: string;
  endAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
  appointmentStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
  paymentStatus: 'NOT_REQUIRED' | 'CREATING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED' | 'REVIEW_REQUIRED' | 'ERROR';
  amountCents: number | null;
  servicePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  promotionName: string | null;
  remainingAmountCents: number | null;
  currency: string;
  expiresAt: string | null;
  checkoutUrl: string | null;
  canRetry: boolean;
  canCancel: boolean;
  publicTerms: string | null;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapPaymentStatus(status: string | null | undefined): PublicBookingPaymentStateDto['paymentStatus'] {
  switch (status) {
    case 'CREATING':
    case 'PENDING':
    case 'APPROVED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'REVIEW_REQUIRED':
    case 'REFUNDED':
    case 'ERROR':
      return status;
    default:
      return 'NOT_REQUIRED';
  }
}

function convertMercadoPagoAmountToCents(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}

function mapMercadoPagoStatus(value: string | null): 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELLED' | 'REFUNDED' | 'ERROR' {
  switch (value) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'REJECTED';
    case 'cancelled':
      return 'CANCELLED';
    case 'refunded':
      return 'REFUNDED';
    case 'charged_back':
      return 'ERROR';
    case 'pending':
    case 'in_process':
    default:
      return 'PENDING';
  }
}

type PaymentDb = Prisma.TransactionClient | typeof prisma;

export async function getLatestBookingPaymentForAppointment(
  appointmentId: string,
  db: PaymentDb = prisma
) {
  return db.bookingPayment.findFirst({
    where: { appointmentId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function assertAppointmentCanBeConfirmedWithPayment(input: {
  appointmentId: string;
  db?: PaymentDb;
}) {
  const db = input.db ?? prisma;
  const payment = await getLatestBookingPaymentForAppointment(input.appointmentId, db);

  if (!payment) {
    return null;
  }

  if (payment.status !== 'APPROVED') {
    throw new AppError(
      409,
      'PAYMENT_APPROVAL_REQUIRED',
      'This appointment cannot be confirmed until the deposit payment is approved'
    );
  }

  return payment;
}

export async function syncBookingPaymentOnAppointmentCancellation(input: {
  appointmentId: string;
  barbershopId: string;
  now: Date;
  reasonCode: string;
  db?: PaymentDb;
}) {
  const db = input.db ?? prisma;
  const payment = await getLatestBookingPaymentForAppointment(input.appointmentId, db);

  if (!payment) {
    return {
      latestPaymentStatus: null,
      reviewRequired: false,
    };
  }

  const openReview = await getOpenPaymentReviewForPayment({
    bookingPaymentId: payment.id,
    db,
  });

  if (payment.status === 'APPROVED') {
    await ensurePaymentReviewCase({
      db,
      barbershopId: input.barbershopId,
      bookingPaymentId: payment.id,
      reason: 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
      now: input.now,
    });
    await db.bookingPayment.update({
      where: { id: payment.id },
      data: {
        reviewRequiredAt: payment.reviewRequiredAt ?? input.now,
        reviewReasonCode: 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
        lastErrorCode: null,
      },
    });

    return {
      latestPaymentStatus: 'REVIEW_REQUIRED' as const,
      reviewRequired: true,
    };
  }

  if (payment.status === 'REVIEW_REQUIRED' || openReview) {
    return {
      latestPaymentStatus: 'REVIEW_REQUIRED' as const,
      reviewRequired: true,
    };
  }

  if (
    payment.status === 'CREATING'
    || payment.status === 'PENDING'
    || payment.status === 'ERROR'
    || payment.status === 'REJECTED'
  ) {
    await db.bookingPayment.update({
      where: { id: payment.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.now,
        providerStatusDetail: input.reasonCode,
        lastErrorCode: null,
      },
    });
    await releaseReservedPromotionRedemptionForAppointment(db, {
      appointmentId: input.appointmentId,
      reason: 'PUBLIC_CANCELLED',
      now: input.now,
    });

    return {
      latestPaymentStatus: 'CANCELLED' as const,
      reviewRequired: false,
    };
  }

  return {
    latestPaymentStatus: payment.status,
    reviewRequired: false,
  };
}

export async function loadPublicBookingPaymentStateByReference(input: {
  slug: string;
  publicReference: string;
}): Promise<PublicBookingPaymentStateDto> {
  const appointment = await prisma.appointment.findUnique({
    where: { publicReference: input.publicReference },
    include: {
      barbershop: {
        select: {
          name: true,
          publicSlug: true,
          isActive: true,
          timezone: true,
          depositPolicy: true,
        },
      },
      employee: {
        select: {
          user: {
            select: { name: true },
          },
        },
      },
      promotionRedemption: {
        select: {
          promotionNameSnapshot: true,
        },
      },
      bookingPayments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          reviews: {
            where: {
              status: { in: ['OPEN', 'IN_PROGRESS'] },
            },
            orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
            take: 1,
          },
        },
      },
    },
  });

  if (!appointment || appointment.barbershop.publicSlug !== input.slug || !appointment.barbershop.isActive) {
    throw new AppError(404, 'NOT_FOUND', 'Public resource not found');
  }

  const payment = appointment.bookingPayments[0] ?? null;
  const checkoutUrl = payment?.checkoutUrlCiphertext
    ? decryptPaymentSecret(payment.checkoutUrlCiphertext, runtime.encryptionKey)
    : null;
  const hasOpenReview = Boolean(payment?.reviews?.length);

  return {
    bookingReference: appointment.publicReference ?? '',
    barbershopName: appointment.barbershop.name,
    serviceName: appointment.serviceName,
    barberName: appointment.employee.user.name?.trim() || 'Barber',
    timezone: appointment.barbershop.timezone,
    localDate: new Intl.DateTimeFormat('en-CA', {
      timeZone: appointment.barbershop.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(appointment.startAt),
    localStartTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: appointment.barbershop.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(appointment.startAt),
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    status: appointment.status,
    appointmentStatus: appointment.status,
    paymentStatus: hasOpenReview ? 'REVIEW_REQUIRED' : mapPaymentStatus(payment?.status),
    amountCents: payment?.amountCents ?? null,
    servicePriceCents: appointment.servicePriceCents,
    discountCents: appointment.discountCents,
    finalPriceCents: appointment.finalPriceCents,
    promotionName: appointment.promotionRedemption?.promotionNameSnapshot ?? null,
    remainingAmountCents: payment ? appointment.finalPriceCents - payment.amountCents : null,
    currency: payment?.currency ?? appointment.serviceCurrency,
    expiresAt: toIso(payment?.expiresAt ?? appointment.paymentHoldExpiresAt),
    checkoutUrl:
      payment && ['CREATING', 'PENDING', 'ERROR'].includes(payment.status) ? checkoutUrl : null,
    canRetry: Boolean(payment && ['ERROR', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(payment.status)),
    canCancel: appointment.status === 'PENDING' || appointment.status === 'CONFIRMED',
    publicTerms: appointment.barbershop.depositPolicy?.publicTerms ?? null,
  };
}

export async function createCheckoutPreferenceForBookingPayment(input: {
  bookingPaymentId: string;
  publicReference: string;
  barbershopSlug: string;
}) {
  const payment = await prisma.bookingPayment.findUniqueOrThrow({
    where: { id: input.bookingPaymentId },
    include: {
      appointment: {
        include: {
          barbershop: {
            include: {
              depositPolicy: true,
            },
          },
          employee: {
            include: {
              user: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  const credentials = await getOperationalMercadoPagoCredentials(payment.barbershopId);
  const initPointBase = runtime.publicWebBaseUrl?.trim();
  if (!initPointBase) {
    throw new AppError(500, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'PUBLIC_WEB_BASE_URL is required for payment checkout returns');
  }
  const webhookPublicUrl = runtime.webhookPublicUrl?.trim();
  if (!webhookPublicUrl) {
    throw new AppError(500, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'PAYMENT_WEBHOOK_PUBLIC_URL is required for Mercado Pago notifications');
  }

  const expiresAt = payment.expiresAt;
  const notificationUrl = `${webhookPublicUrl}?external_reference=${encodeURIComponent(payment.externalReference)}`;

  const preference = await createMercadoPagoCheckoutPreference({
    runtime,
    accessToken: credentials.accessToken,
    idempotencyKey: payment.externalReference,
    body: {
      external_reference: payment.externalReference,
      items: [
        {
          id: payment.id,
          title: `Seña turno ${payment.appointment.serviceName}`,
          quantity: 1,
          currency_id: payment.currency,
          unit_price: Number((payment.amountCents / 100).toFixed(2)),
        },
      ],
      payer: {
        name: payment.appointment.clientName,
        email: payment.appointment.clientEmail ?? undefined,
      },
      metadata: {
        booking_payment_id: payment.id,
      },
      back_urls: {
        success: `${initPointBase}/barberias/${encodeURIComponent(input.barbershopSlug)}/pago/exito?ref=${encodeURIComponent(input.publicReference)}`,
        pending: `${initPointBase}/barberias/${encodeURIComponent(input.barbershopSlug)}/pago/pendiente?ref=${encodeURIComponent(input.publicReference)}`,
        failure: `${initPointBase}/barberias/${encodeURIComponent(input.barbershopSlug)}/pago/error?ref=${encodeURIComponent(input.publicReference)}`,
      },
      notification_url: notificationUrl,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: expiresAt.toISOString(),
    },
  });

  const checkoutUrl = preference.initPoint ?? preference.sandboxInitPoint;
  if (!checkoutUrl) {
    throw new AppError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Mercado Pago did not return a checkout URL');
  }

  await prisma.bookingPayment.update({
    where: { id: payment.id },
    data: {
      status: 'PENDING',
      providerPreferenceId: preference.id,
      checkoutUrlCiphertext: encryptPaymentSecret(checkoutUrl, runtime.encryptionKey),
      providerStatus: 'preference_created',
      providerStatusDetail: null,
      lastErrorCode: null,
    },
  });

  return checkoutUrl;
}

export async function releaseExpiredPaymentHolds(input: {
  now?: Date;
  employeeId?: string;
} = {}) {
  const now = input.now ?? new Date();
  const dueAppointments = await prisma.appointment.findMany({
    where: {
      status: 'PENDING',
      paymentHoldExpiresAt: { lte: now },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    },
    select: {
      id: true,
      barbershopId: true,
    },
  });

  let expiredCount = 0;

  for (const appointment of dueAppointments) {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.bookingPayment.findFirst({
        where: {
          appointmentId: appointment.id,
          status: { in: ['CREATING', 'PENDING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!payment) {
        return false;
      }

      const updatePayment = await tx.bookingPayment.updateMany({
        where: {
          id: payment.id,
          status: { in: ['CREATING', 'PENDING'] },
        },
        data: {
          status: 'EXPIRED',
          expiredAt: now,
          providerStatus: 'expired_locally',
          providerStatusDetail: null,
        },
      });

      if (updatePayment.count === 0) {
        return false;
      }

      const updateAppointment = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: 'PENDING',
          paymentHoldExpiresAt: { lte: now },
        },
        data: {
          status: 'CANCELLED',
          paymentHoldExpiresAt: null,
          ...buildLifecycleUpdateForCancel({
            actorRole: null,
            source: 'SYSTEM',
            now,
            reason: 'PAYMENT_HOLD_EXPIRED',
          }),
        },
      });

      if (updateAppointment.count === 0) {
        return false;
      }

      await cancelAppointmentNotifications(tx, {
        appointmentId: appointment.id,
        barbershopId: appointment.barbershopId,
        types: ['BOOKING_CONFIRMATION', 'REMINDER_24H'],
        now,
      });
      await releaseReservedPromotionRedemptionForAppointment(tx, {
        appointmentId: appointment.id,
        reason: 'HOLD_EXPIRED',
        now,
      });

      return true;
    });

    if (result) {
      expiredCount += 1;
    }
  }

  return { expiredCount };
}

export function validateMercadoPagoWebhookSignature(input: {
  rawBody: Buffer;
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  rawDataId?: string | undefined;
}) {
  const secret = runtime.mercadoPago.webhookSecret;
  if (!secret) {
    throw new AppError(500, 'PAYMENT_PROVIDER_CONFIGURATION_ERROR', 'Mercado Pago webhook secret is not configured');
  }

  if (!input.xSignature || !input.xRequestId || !input.dataId) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Missing Mercado Pago webhook signature data');
  }

  if (input.xSignature.length > MAX_WEBHOOK_SIGNATURE_HEADER_LENGTH) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
  }

  if ((input.rawDataId ?? input.dataId) !== input.dataId || input.dataId.trim() !== input.dataId || input.dataId.length === 0) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
  }

  const signatureParts = new Map<string, string>();
  for (const part of input.xSignature.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const pair = trimmed.split('=');
    if (pair.length !== 2) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
    }
    const key = pair[0];
    const value = pair[1];
    if (key === undefined || value === undefined) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
    }
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue || signatureParts.has(normalizedKey)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
    }
    signatureParts.set(normalizedKey, normalizedValue);
  }

  const timestamp = signatureParts.get('ts');
  const v1 = signatureParts.get('v1');
  if (!timestamp || !v1 || signatureParts.size !== 2) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
  }

  if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(v1)) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
  }

  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${timestamp};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (!timingSafeEqualHex(expected, v1)) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid Mercado Pago webhook signature');
  }

  return { timestamp };
}

export async function persistMercadoPagoWebhook(input: {
  rawBody: Buffer;
  requestId?: string;
  signatureTs?: string;
  dataId: string;
  externalReference?: string | null;
  topic?: string | null;
  action?: string | null;
}) {
  const uniqueExternalReference = input.externalReference ?? '__missing__';
  const payment = input.externalReference
    ? await prisma.bookingPayment.findUnique({
        where: { externalReference: input.externalReference },
      })
    : null;

  return prisma.paymentWebhookEvent.upsert({
    where: {
      provider_dataId_externalReference: {
        provider: 'MERCADO_PAGO',
        dataId: input.dataId,
        externalReference: uniqueExternalReference,
      },
    },
    create: {
      provider: 'MERCADO_PAGO',
      barbershopId: payment?.barbershopId ?? null,
      paymentConnectionId: payment?.paymentConnectionId ?? null,
      bookingPaymentId: payment?.id ?? null,
      status: 'RECEIVED',
      eventTopic: input.topic ?? null,
      eventAction: input.action ?? null,
      dataId: input.dataId,
      externalReference: input.externalReference ?? uniqueExternalReference,
      requestId: input.requestId ?? null,
      signatureTs: input.signatureTs ?? null,
      rawBodySha256: crypto.createHash('sha256').update(input.rawBody).digest('hex'),
    },
    update: {
      requestId: input.requestId ?? null,
      status: 'RECEIVED',
      lastErrorCode: null,
      updatedAt: new Date(),
    },
  });
}

export async function processPendingPaymentWebhookEvents(input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const events = await prisma.paymentWebhookEvent.findMany({
    where: { status: { in: ['RECEIVED', 'ERROR'] } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  let processed = 0;

  for (const event of events) {
    const payment = event.externalReference
      ? await prisma.bookingPayment.findUnique({
          where: { externalReference: event.externalReference },
        })
      : null;

    try {
      const claimed = await prisma.paymentWebhookEvent.updateMany({
        where: {
          id: event.id,
          status: { in: ['RECEIVED', 'ERROR'] },
        },
        data: {
          status: 'PROCESSING',
          lastErrorCode: null,
          attemptCount: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        continue;
      }

      if (!event.externalReference) {
        await prisma.paymentWebhookEvent.updateMany({
          where: { id: event.id, status: 'PROCESSING' },
          data: { status: 'REJECTED', lastErrorCode: 'MISSING_EXTERNAL_REFERENCE' },
        });
        continue;
      }

      if (!payment) {
        await prisma.paymentWebhookEvent.updateMany({
          where: { id: event.id, status: 'PROCESSING' },
          data: { status: 'REJECTED', lastErrorCode: 'PAYMENT_NOT_FOUND' },
        });
        continue;
      }

      const credentials = await getOperationalMercadoPagoCredentials(payment.barbershopId);
      const providerPayment = await getMercadoPagoPaymentById({
        runtime,
        accessToken: credentials.accessToken,
        paymentId: event.dataId,
      });

      await reconcileAuthoritativePayment({
        bookingPaymentId: payment.id,
        providerPayment,
        sellerId: credentials.sellerId,
        now,
      });

      await prisma.paymentWebhookEvent.updateMany({
        where: { id: event.id, status: 'PROCESSING' },
        data: {
          status: 'PROCESSED',
          processedAt: now,
          bookingPaymentId: payment.id,
          barbershopId: payment.barbershopId,
          paymentConnectionId: payment.paymentConnectionId,
          lastErrorCode: null,
        },
      });
      processed += 1;
    } catch (error) {
      if (payment) {
        await prisma.$transaction(async (tx) => {
          await ensurePaymentReviewCase({
            db: tx,
            barbershopId: payment.barbershopId,
            bookingPaymentId: payment.id,
            reason: 'PROVIDER_RECONCILIATION_ERROR',
            now,
          });
          await tx.bookingPayment.update({
            where: { id: payment.id },
            data: {
              reviewRequiredAt: now,
              reviewReasonCode: 'PROVIDER_RECONCILIATION_ERROR',
              lastErrorCode: error instanceof AppError ? error.code : 'UNEXPECTED_PAYMENT_WEBHOOK_ERROR',
            },
          });
        });
      }

      await prisma.paymentWebhookEvent.updateMany({
        where: { id: event.id, status: 'PROCESSING' },
        data: {
          status: 'ERROR',
          lastErrorCode:
            error instanceof AppError ? error.code : 'UNEXPECTED_PAYMENT_WEBHOOK_ERROR',
        },
      });
    }
  }

  return { processed };
}

export async function reconcileAuthoritativePayment(input: {
  bookingPaymentId: string;
  providerPayment: {
    id: string;
    status: string | null;
    statusDetail: string | null;
    currencyId: string | null;
    transactionAmount: number | null;
    externalReference: string | null;
    collectorId: string | null;
    dateApproved: string | null;
    bookingPaymentId: string | null;
  };
  sellerId: string | null;
  now: Date;
}) {
  const payment = await prisma.bookingPayment.findUniqueOrThrow({
    where: { id: input.bookingPaymentId },
    include: {
      appointment: true,
      barbershop: {
        include: {
          depositPolicy: true,
        },
      },
      paymentConnection: true,
    },
  });

  const providerAmountCents = convertMercadoPagoAmountToCents(input.providerPayment.transactionAmount);
  const normalizedStatus = mapMercadoPagoStatus(input.providerPayment.status);
  const reviewReasons: Array<
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'SELLER_MISMATCH'
    | 'EXTERNAL_REFERENCE_MISMATCH'
    | 'PREFERENCE_MISMATCH'
    | 'DUPLICATE_PROVIDER_PAYMENT'
  > = [];

  if (providerAmountCents !== payment.amountCents) {
    reviewReasons.push('AMOUNT_MISMATCH');
  }
  if (input.providerPayment.currencyId !== payment.currency) {
    reviewReasons.push('CURRENCY_MISMATCH');
  }
  if (input.providerPayment.externalReference !== payment.externalReference) {
    reviewReasons.push('EXTERNAL_REFERENCE_MISMATCH');
  }
  if (input.sellerId && input.providerPayment.collectorId && input.sellerId !== input.providerPayment.collectorId) {
    reviewReasons.push('SELLER_MISMATCH');
  }
  if (input.providerPayment.bookingPaymentId && input.providerPayment.bookingPaymentId !== payment.id) {
    reviewReasons.push('PREFERENCE_MISMATCH');
  }
  if (input.providerPayment.id) {
    const duplicatePayment = await prisma.bookingPayment.findFirst({
      where: {
        providerPaymentId: input.providerPayment.id,
        id: { not: payment.id },
      },
      select: { id: true },
    });
    if (duplicatePayment) {
      reviewReasons.push('DUPLICATE_PROVIDER_PAYMENT');
    }
  }

  if (reviewReasons.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.bookingPayment.update({
        where: { id: payment.id },
        data: {
          status: normalizedStatus === 'APPROVED' ? 'APPROVED' : normalizedStatus,
          approvedAt: normalizedStatus === 'APPROVED'
            ? (input.providerPayment.dateApproved ? new Date(input.providerPayment.dateApproved) : input.now)
            : payment.approvedAt,
          rejectedAt: normalizedStatus === 'REJECTED' ? input.now : payment.rejectedAt,
          cancelledAt: normalizedStatus === 'CANCELLED' ? input.now : payment.cancelledAt,
          providerPaymentId: input.providerPayment.id,
          providerStatus: input.providerPayment.status,
          providerStatusDetail: input.providerPayment.statusDetail,
          reviewRequiredAt: input.now,
          reviewReasonCode: reviewReasons[0],
          lastErrorCode: null,
        },
      });

      for (const reason of reviewReasons) {
        await ensurePaymentReviewCase({
          db: tx,
          barbershopId: payment.barbershopId,
          bookingPaymentId: payment.id,
          reason,
          now: input.now,
        });
      }
    });
    return;
  }

  if (normalizedStatus === 'APPROVED') {
    const approvedAt = input.providerPayment.dateApproved ? new Date(input.providerPayment.dateApproved) : input.now;

    if (payment.appointment.paymentHoldExpiresAt && payment.appointment.paymentHoldExpiresAt.getTime() <= input.now.getTime()) {
      await prisma.$transaction(async (tx) => {
        await tx.bookingPayment.update({
          where: { id: payment.id },
          data: {
            status: 'APPROVED',
            approvedAt,
            reviewRequiredAt: input.now,
            reviewReasonCode: 'APPROVED_AFTER_HOLD_EXPIRY',
            providerPaymentId: input.providerPayment.id,
            providerStatus: input.providerPayment.status,
            providerStatusDetail: input.providerPayment.statusDetail,
          },
        });
        await ensurePaymentReviewCase({
          db: tx,
          barbershopId: payment.barbershopId,
          bookingPaymentId: payment.id,
          reason: 'APPROVED_AFTER_HOLD_EXPIRY',
          now: input.now,
        });

        await tx.appointment.updateMany({
          where: {
            id: payment.appointmentId,
            status: 'PENDING',
          },
          data: {
            status: 'CANCELLED',
            paymentHoldExpiresAt: null,
            ...buildLifecycleUpdateForCancel({
              actorRole: null,
              source: 'SYSTEM',
              now: input.now,
              reason: 'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY',
            }),
          },
        });
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookingPayment.update({
        where: { id: payment.id },
        data: {
          status: 'APPROVED',
          approvedAt,
          providerPaymentId: input.providerPayment.id,
          providerStatus: input.providerPayment.status,
          providerStatusDetail: input.providerPayment.statusDetail,
          reviewReasonCode: null,
          lastErrorCode: null,
        },
      });

      const result = await tx.appointment.updateMany({
        where: {
          id: payment.appointmentId,
          status: 'PENDING',
          paymentHoldExpiresAt: { gt: input.now },
        },
        data: {
          status: 'CONFIRMED',
          paymentHoldExpiresAt: null,
          paymentConfirmedAt: approvedAt,
          confirmedAt: approvedAt,
        },
      });

      if (result.count === 0) {
        await ensurePaymentReviewCase({
          db: tx,
          barbershopId: payment.barbershopId,
          bookingPaymentId: payment.id,
          reason: 'APPROVED_AFTER_HOLD_EXPIRY',
          now: input.now,
        });
        await tx.bookingPayment.update({
          where: { id: payment.id },
          data: {
            status: 'APPROVED',
            approvedAt,
            reviewRequiredAt: input.now,
            reviewReasonCode: 'APPROVED_AFTER_HOLD_EXPIRY',
          },
        });
        await tx.appointment.updateMany({
          where: {
            id: payment.appointmentId,
            status: 'PENDING',
          },
          data: {
            status: 'CANCELLED',
            paymentHoldExpiresAt: null,
            ...buildLifecycleUpdateForCancel({
              actorRole: null,
              source: 'SYSTEM',
              now: input.now,
              reason: 'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY',
            }),
          },
        });
        return;
      }

      await consumeReservedPromotionRedemptionForAppointment(tx, {
        appointmentId: payment.appointmentId,
        now: approvedAt,
      });

      await scheduleAppointmentNotificationsForNewAppointment(tx, {
        appointmentId: payment.appointmentId,
        now: input.now,
      });
    });

    return;
  }

  if (normalizedStatus === 'PENDING') {
    await prisma.bookingPayment.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING',
        providerPaymentId: input.providerPayment.id,
        providerStatus: input.providerPayment.status,
        providerStatusDetail: input.providerPayment.statusDetail,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookingPayment.update({
      where: { id: payment.id },
      data: {
        status: normalizedStatus,
        rejectedAt: normalizedStatus === 'REJECTED' ? input.now : null,
        cancelledAt: normalizedStatus === 'CANCELLED' ? input.now : null,
        providerPaymentId: input.providerPayment.id,
        providerStatus: input.providerPayment.status,
        providerStatusDetail: input.providerPayment.statusDetail,
      },
    });

    await tx.appointment.updateMany({
      where: {
        id: payment.appointmentId,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
        paymentHoldExpiresAt: null,
        ...buildLifecycleUpdateForCancel({
          actorRole: null,
          source: 'SYSTEM',
          now: input.now,
          reason:
            normalizedStatus === 'REJECTED'
              ? 'PAYMENT_REJECTED'
              : 'PAYMENT_CANCELLED',
        }),
      },
    });

    await cancelAppointmentNotifications(tx, {
      appointmentId: payment.appointmentId,
      barbershopId: payment.barbershopId,
      types: ['BOOKING_CONFIRMATION', 'REMINDER_24H'],
      now: input.now,
    });
    await releaseReservedPromotionRedemptionForAppointment(tx, {
      appointmentId: payment.appointmentId,
      reason: normalizedStatus === 'REJECTED' ? 'PAYMENT_REJECTED' : 'PAYMENT_CANCELLED',
      now: input.now,
    });
  });
}

export async function getBarbershopPaymentSummary(barbershopId: string, now: Date = new Date()) {
  const [pendingTooLong, expired, reviewRequired, approvedCancelled] = await Promise.all([
    prisma.bookingPayment.count({
      where: {
        barbershopId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
    }),
    prisma.bookingPayment.count({
      where: {
        barbershopId,
        status: 'EXPIRED',
      },
    }),
    prisma.bookingPaymentReview.count({
      where: {
        barbershopId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    }),
    prisma.bookingPayment.count({
      where: {
        barbershopId,
        status: 'APPROVED',
        appointment: {
          status: 'CANCELLED',
        },
      },
    }),
  ]);

  return {
    pendingTooLong,
    expired,
    reviewRequired,
    approvedCancelled,
  };
}

export async function listBarbershopPayments(input: {
  barbershopId: string;
  status?: Prisma.BookingPaymentWhereInput['status'];
  page: number;
  limit: number;
}) {
  const items = await prisma.bookingPayment.findMany({
    where: {
      barbershopId: input.barbershopId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    skip: (input.page - 1) * input.limit,
    take: input.limit,
    include: {
      appointment: {
        select: {
          publicReference: true,
          clientName: true,
          startAt: true,
          serviceName: true,
          status: true,
        },
      },
      reviews: {
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
        take: 1,
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    appointmentReference: item.appointment.publicReference,
    customerDisplayName: item.appointment.clientName,
    appointmentStartAt: item.appointment.startAt.toISOString(),
    serviceName: item.appointment.serviceName,
    appointmentStatus: item.appointment.status,
    status: item.reviews.length > 0 ? 'REVIEW_REQUIRED' : item.status,
    amountCents: item.amountCents,
    currency: item.currency,
    reviewReasonCode: item.reviews[0]?.reason ?? item.reviewReasonCode,
    expiresAt: item.expiresAt.toISOString(),
    approvedAt: toIso(item.approvedAt),
    createdAt: item.createdAt.toISOString(),
  }));
}

export async function getBarbershopPaymentDetail(input: {
  barbershopId: string;
  paymentId: string;
}) {
  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: input.paymentId,
      barbershopId: input.barbershopId,
    },
    include: {
      appointment: {
        select: {
          publicReference: true,
          clientName: true,
          clientEmail: true,
          startAt: true,
          endAt: true,
          serviceName: true,
          status: true,
        },
      },
      reviews: {
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
        take: 1,
      },
    },
  });

  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  }

  const openReview = payment.reviews[0] ?? null;

  return {
    id: payment.id,
    status: openReview ? 'REVIEW_REQUIRED' : payment.status,
    businessStatus: payment.status,
    amountCents: payment.amountCents,
    currency: payment.currency,
    expiresAt: payment.expiresAt.toISOString(),
    approvedAt: toIso(payment.approvedAt),
    rejectedAt: toIso(payment.rejectedAt),
    cancelledAt: toIso(payment.cancelledAt),
    expiredAt: toIso(payment.expiredAt),
    reviewRequiredAt: toIso(payment.reviewRequiredAt),
    reviewReasonCode: openReview?.reason ?? payment.reviewReasonCode,
    providerStatus: payment.providerStatus,
    providerStatusDetail: payment.providerStatusDetail,
    review: openReview
      ? {
          id: openReview.id,
          status: openReview.status,
          reason: openReview.reason,
        }
      : null,
    timeline: await getPaymentTimelineForPayment(payment.id),
    providerEvents: await getProviderEventSummariesForPayment(payment.id),
    appointment: {
      publicReference: payment.appointment.publicReference,
      customerDisplayName: payment.appointment.clientName,
      startAt: payment.appointment.startAt.toISOString(),
      endAt: payment.appointment.endAt.toISOString(),
      serviceName: payment.appointment.serviceName,
      status: payment.appointment.status,
    },
  };
}
