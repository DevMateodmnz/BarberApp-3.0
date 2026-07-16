import { Prisma, type PaymentReviewActionType, type PaymentReviewReason, type PaymentReviewResolution, type PaymentReviewStatus, type UserRole } from '@prisma/client';
import { AppError, BadRequestError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

export const PAYMENT_REVIEW_CONFLICT_CODE = 'PAYMENT_REVIEW_CONFLICT';
const RESOLVED_RECENTLY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const TIMELINE_LIMIT = 50;
const NOTE_PREVIEW_LENGTH = 120;

export type PaymentReviewDb = Prisma.TransactionClient | typeof prisma;

export interface PaymentReviewSummary {
  open: number;
  inProgress: number;
  resolvedRecently: number;
  lateApproval: number;
  cancelledPaidAppointment: number;
  providerMismatch: number;
}

export interface PaymentReviewListItem {
  id: string;
  paymentId: string;
  appointmentId: string;
  status: PaymentReviewStatus;
  reason: PaymentReviewReason;
  amountCents: number;
  currency: string;
  customerDisplayName: string;
  serviceName: string;
  appointmentStartAt: string;
  openedAt: string;
  assignedToDisplayName: string | null;
  latestSafeNotePreview: string | null;
}

export interface PaymentReviewListResult {
  items: PaymentReviewListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaymentTimelineItem {
  type: string;
  occurredAt: string;
  label: string;
  detail: string | null;
}

export interface ProviderEventSummaryItem {
  id: string;
  topic: string | null;
  action: string | null;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  lastSafeErrorCode: string | null;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
}

export interface PaymentReviewActionItem {
  id: string;
  action: PaymentReviewActionType;
  actorDisplayName: string | null;
  actorRole: UserRole | null;
  note: string | null;
  resolution: PaymentReviewResolution | null;
  createdAt: string;
}

export interface PaymentReviewDetail {
  id: string;
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    providerStatus: string | null;
    providerStatusDetail: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
    reviewRequiredAt: string | null;
  };
  appointment: {
    id: string;
    publicReference: string | null;
    customerDisplayName: string;
    serviceName: string;
    startAt: string;
    endAt: string;
    status: string;
  };
  review: {
    status: PaymentReviewStatus;
    reason: PaymentReviewReason;
    resolution: PaymentReviewResolution | null;
    openedAt: string;
    startedAt: string | null;
    resolvedAt: string | null;
    assignedToDisplayName: string | null;
    latestNote: string | null;
  };
  timeline: PaymentTimelineItem[];
  actions: PaymentReviewActionItem[];
  providerEvents: ProviderEventSummaryItem[];
  allowedActions: {
    canStart: boolean;
    canAddNote: boolean;
    canResolve: boolean;
    canReopen: boolean;
  };
}

const PAYMENT_REVIEW_REASON_LABELS: Record<PaymentReviewReason, string> = {
  APPROVED_AFTER_HOLD_EXPIRY: 'Pago aprobado después del vencimiento de la reserva',
  APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT: 'Pago aprobado en un turno cancelado',
  AMOUNT_MISMATCH: 'Diferencia de importe',
  CURRENCY_MISMATCH: 'Diferencia de moneda',
  SELLER_MISMATCH: 'Diferencia de cuenta vendedora',
  EXTERNAL_REFERENCE_MISMATCH: 'Diferencia de referencia externa',
  PREFERENCE_MISMATCH: 'Diferencia de preferencia',
  DUPLICATE_PROVIDER_PAYMENT: 'Pago duplicado del proveedor',
  PROVIDER_RECONCILIATION_ERROR: 'No se pudo reconciliar el pago del proveedor',
  OTHER: 'Otro caso de revisión',
};

const PAYMENT_REVIEW_RESOLUTION_LABELS: Record<PaymentReviewResolution, string> = {
  REFUNDED_EXTERNALLY: 'Reintegrado externamente',
  NO_REFUND_REQUIRED: 'No requiere reintegro',
  CUSTOMER_CREDIT_GRANTED: 'Crédito otorgado al cliente',
  PAYMENT_ACCEPTED_MANUALLY: 'Pago aceptado manualmente',
  DUPLICATE_RESOLVED: 'Duplicado resuelto',
  OTHER: 'Otra resolución',
};

const PROVIDER_MISMATCH_REASONS: PaymentReviewReason[] = [
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'SELLER_MISMATCH',
  'EXTERNAL_REFERENCE_MISMATCH',
  'PREFERENCE_MISMATCH',
  'DUPLICATE_PROVIDER_PAYMENT',
  'PROVIDER_RECONCILIATION_ERROR',
  'OTHER',
];

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function sanitizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.replace(/\s+/g, ' ').trim() ?? '';
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 1000) {
    throw new BadRequestError('Review notes must be 1000 characters or fewer');
  }

  return trimmed;
}

function previewNote(note: string | null | undefined): string | null {
  const sanitized = sanitizeNote(note);
  if (!sanitized) {
    return null;
  }

  if (sanitized.length <= NOTE_PREVIEW_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, NOTE_PREVIEW_LENGTH - 1)}…`;
}

function mapProviderEventStatus(status: string): ProviderEventSummaryItem['status'] {
  switch (status) {
    case 'RECEIVED':
      return 'received';
    case 'PROCESSING':
      return 'processing';
    case 'PROCESSED':
      return 'processed';
    case 'REJECTED':
      return 'ignored';
    default:
      return 'failed';
  }
}

function reviewStatusAllowsAction(status: PaymentReviewStatus) {
  return {
    canStart: status === 'OPEN',
    canAddNote: status === 'OPEN' || status === 'IN_PROGRESS',
    canResolve: status === 'OPEN' || status === 'IN_PROGRESS',
    canReopen: status === 'RESOLVED',
  };
}

function paymentReviewConflict(message: string) {
  return new AppError(409, PAYMENT_REVIEW_CONFLICT_CODE, message);
}

function buildReviewWhere(input: {
  barbershopId: string;
  status?: PaymentReviewStatus;
  reason?: PaymentReviewReason;
  dateFrom?: Date;
  dateTo?: Date;
}): Prisma.BookingPaymentReviewWhereInput {
  return {
    barbershopId: input.barbershopId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...((input.dateFrom || input.dateTo)
      ? {
          openedAt: {
            ...(input.dateFrom ? { gte: input.dateFrom } : {}),
            ...(input.dateTo ? { lte: input.dateTo } : {}),
          },
        }
      : {}),
  };
}

function buildReviewOrderBy(sort: 'newest' | 'oldest' | 'amount'): Prisma.BookingPaymentReviewOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ openedAt: 'asc' }, { id: 'asc' }];
    case 'amount':
      return [
        { bookingPayment: { amountCents: 'desc' } },
        { openedAt: 'desc' },
        { id: 'desc' },
      ];
    case 'newest':
    default:
      return [{ openedAt: 'desc' }, { id: 'desc' }];
  }
}

async function assertReviewActorBelongsToBarbershop(db: PaymentReviewDb, input: {
  actorUserId: string;
  barbershopId: string;
}) {
  const user = await db.user.findFirst({
    where: {
      id: input.actorUserId,
      ownedBarbershops: {
        some: { id: input.barbershopId },
      },
    },
    select: { id: true, name: true, role: true },
  });

  if (!user || user.role !== 'OWNER') {
    throw new AppError(404, 'NOT_FOUND', 'Payment review not found');
  }

  return user;
}

export async function ensurePaymentReviewCase(input: {
  db?: PaymentReviewDb;
  barbershopId: string;
  bookingPaymentId: string;
  reason: PaymentReviewReason;
  now: Date;
  note?: string | null;
  actorUserId?: string | null;
  actorRole?: UserRole | null;
}) {
  const db = input.db ?? prisma;
  const sanitizedNote = sanitizeNote(input.note);

  const existing = await db.bookingPaymentReview.findUnique({
    where: {
      bookingPaymentId_reason: {
        bookingPaymentId: input.bookingPaymentId,
        reason: input.reason,
      },
    },
  });

  if (existing) {
    if (existing.status === 'RESOLVED') {
      const reopened = await db.bookingPaymentReview.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          resolution: null,
          resolvedAt: null,
          resolvedByUserId: null,
          assignedToUserId: input.actorUserId ?? existing.assignedToUserId,
          startedAt: null,
          latestNote: sanitizedNote ?? existing.latestNote,
        },
      });

      await db.bookingPaymentReviewAction.create({
        data: {
          barbershopId: input.barbershopId,
          reviewId: reopened.id,
          action: 'REOPENED',
          actorUserId: input.actorUserId ?? null,
          actorRole: input.actorRole ?? null,
          note: sanitizedNote,
        },
      });

      return reopened;
    }

    if (sanitizedNote && sanitizedNote !== existing.latestNote) {
      return db.bookingPaymentReview.update({
        where: { id: existing.id },
        data: { latestNote: sanitizedNote },
      });
    }

    return existing;
  }

  const review = await db.bookingPaymentReview.create({
    data: {
      barbershopId: input.barbershopId,
      bookingPaymentId: input.bookingPaymentId,
      reason: input.reason,
      status: 'OPEN',
      openedAt: input.now,
      latestNote: sanitizedNote,
    },
  });

  await db.bookingPaymentReviewAction.create({
    data: {
      barbershopId: input.barbershopId,
      reviewId: review.id,
      action: 'OPENED',
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      note: sanitizedNote,
      createdAt: input.now,
    },
  });

  return review;
}

export async function getOpenPaymentReviewForPayment(input: {
  bookingPaymentId: string;
  db?: PaymentReviewDb;
}) {
  const db = input.db ?? prisma;
  return db.bookingPaymentReview.findFirst({
    where: {
      bookingPaymentId: input.bookingPaymentId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    orderBy: [
      { openedAt: 'asc' },
      { id: 'asc' },
    ],
    include: {
      assignedToUser: {
        select: { name: true, email: true },
      },
    },
  });
}

export async function getBarbershopPaymentReviewSummary(input: {
  barbershopId: string;
  now?: Date;
}): Promise<PaymentReviewSummary> {
  const now = input.now ?? new Date();
  const resolvedCutoff = new Date(now.getTime() - RESOLVED_RECENTLY_WINDOW_MS);

  const [open, inProgress, resolvedRecently, lateApproval, cancelledPaidAppointment, providerMismatch] = await Promise.all([
    prisma.bookingPaymentReview.count({
      where: { barbershopId: input.barbershopId, status: 'OPEN' },
    }),
    prisma.bookingPaymentReview.count({
      where: { barbershopId: input.barbershopId, status: 'IN_PROGRESS' },
    }),
    prisma.bookingPaymentReview.count({
      where: {
        barbershopId: input.barbershopId,
        status: 'RESOLVED',
        resolvedAt: { gte: resolvedCutoff },
      },
    }),
    prisma.bookingPaymentReview.count({
      where: {
        barbershopId: input.barbershopId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        reason: 'APPROVED_AFTER_HOLD_EXPIRY',
      },
    }),
    prisma.bookingPaymentReview.count({
      where: {
        barbershopId: input.barbershopId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        reason: 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
      },
    }),
    prisma.bookingPaymentReview.count({
      where: {
        barbershopId: input.barbershopId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        reason: { in: PROVIDER_MISMATCH_REASONS },
      },
    }),
  ]);

  return {
    open,
    inProgress,
    resolvedRecently,
    lateApproval,
    cancelledPaidAppointment,
    providerMismatch,
  };
}

export async function listBarbershopPaymentReviews(input: {
  barbershopId: string;
  status?: PaymentReviewStatus;
  reason?: PaymentReviewReason;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
  sort: 'newest' | 'oldest' | 'amount';
}): Promise<PaymentReviewListResult> {
  const where = buildReviewWhere(input);
  const [rows, total] = await Promise.all([
    prisma.bookingPaymentReview.findMany({
      where,
      orderBy: buildReviewOrderBy(input.sort),
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        assignedToUser: {
          select: { name: true, email: true },
        },
        bookingPayment: {
          select: {
            id: true,
            amountCents: true,
            currency: true,
            appointmentId: true,
            appointment: {
              select: {
                clientName: true,
                serviceName: true,
                startAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.bookingPaymentReview.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      paymentId: row.bookingPayment.id,
      appointmentId: row.bookingPayment.appointmentId,
      status: row.status,
      reason: row.reason,
      amountCents: row.bookingPayment.amountCents,
      currency: row.bookingPayment.currency,
      customerDisplayName: row.bookingPayment.appointment.clientName,
      serviceName: row.bookingPayment.appointment.serviceName,
      appointmentStartAt: row.bookingPayment.appointment.startAt.toISOString(),
      openedAt: row.openedAt.toISOString(),
      assignedToDisplayName:
        row.assignedToUser?.name?.trim() || row.assignedToUser?.email || null,
      latestSafeNotePreview: previewNote(row.latestNote),
    })),
    total,
    page: input.page,
    limit: input.limit,
    hasMore: input.page * input.limit < total,
  };
}

export async function getPaymentTimelineForPayment(paymentId: string): Promise<PaymentTimelineItem[]> {
  const payment = await prisma.bookingPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      appointment: {
        select: {
          createdAt: true,
          confirmedAt: true,
          cancelledAt: true,
          status: true,
          paymentHoldExpiresAt: true,
        },
      },
      webhookEvents: {
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      },
      reviews: {
        orderBy: [
          { openedAt: 'asc' },
          { id: 'asc' },
        ],
        include: {
          actions: {
            orderBy: [
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
          },
        },
      },
    },
  });

  const events: Array<{ occurredAt: Date; type: string; label: string; detail: string | null }> = [];

  events.push({
    occurredAt: payment.createdAt,
    type: 'HOLD_CREATED',
    label: 'Reserva con seña creada',
    detail: null,
  });

  if (payment.providerPreferenceId) {
    events.push({
      occurredAt: payment.updatedAt,
      type: 'PREFERENCE_CREATED',
      label: 'Preferencia de checkout creada',
      detail: null,
    });
  }

  for (const event of payment.webhookEvents) {
    events.push({
      occurredAt: event.createdAt,
      type: 'PROVIDER_EVENT_RECEIVED',
      label: 'Evento del proveedor recibido',
      detail: event.eventAction ?? event.eventTopic ?? null,
    });
    if (event.processedAt) {
      events.push({
        occurredAt: event.processedAt,
        type: 'PROVIDER_EVENT_PROCESSED',
        label: 'Evento del proveedor procesado',
        detail: event.lastErrorCode ?? null,
      });
    }
  }

  if (payment.approvedAt) {
    events.push({
      occurredAt: payment.approvedAt,
      type: 'PAYMENT_RECONCILED_APPROVED',
      label: 'Pago conciliado como aprobado',
      detail: null,
    });
  }

  if (payment.rejectedAt) {
    events.push({
      occurredAt: payment.rejectedAt,
      type: 'PAYMENT_RECONCILED_REJECTED',
      label: 'Pago conciliado como rechazado',
      detail: null,
    });
  }

  if (payment.cancelledAt) {
    events.push({
      occurredAt: payment.cancelledAt,
      type: 'PAYMENT_RECONCILED_CANCELLED',
      label: 'Pago conciliado como cancelado',
      detail: null,
    });
  }

  if (payment.expiredAt) {
    events.push({
      occurredAt: payment.expiredAt,
      type: 'PAYMENT_HOLD_RELEASED',
      label: 'Reserva liberada por vencimiento',
      detail: null,
    });
  }

  if (payment.appointment.confirmedAt) {
    events.push({
      occurredAt: payment.appointment.confirmedAt,
      type: 'APPOINTMENT_CONFIRMED',
      label: 'Turno confirmado',
      detail: null,
    });
  }

  if (payment.appointment.cancelledAt) {
    events.push({
      occurredAt: payment.appointment.cancelledAt,
      type: 'APPOINTMENT_RELEASED',
      label: 'Turno liberado o cancelado',
      detail: payment.appointment.status,
    });
  }

  for (const review of payment.reviews) {
    events.push({
      occurredAt: review.openedAt,
      type: 'PAYMENT_REVIEW_OPENED',
      label: 'Caso de revisión abierto',
      detail: PAYMENT_REVIEW_REASON_LABELS[review.reason],
    });

    for (const action of review.actions) {
      const actionLabel =
        action.action === 'MARKED_IN_PROGRESS'
          ? 'Revisión marcada en curso'
          : action.action === 'NOTE_ADDED'
            ? 'Nota agregada a la revisión'
            : action.action === 'RESOLVED'
              ? 'Revisión resuelta'
              : action.action === 'REOPENED'
                ? 'Revisión reabierta'
                : 'Caso de revisión abierto';
      events.push({
        occurredAt: action.createdAt,
        type: `PAYMENT_REVIEW_${action.action}`,
        label: actionLabel,
        detail: action.resolution ? PAYMENT_REVIEW_RESOLUTION_LABELS[action.resolution] : previewNote(action.note),
      });
    }
  }

  return events
    .sort((left, right) => {
      const time = left.occurredAt.getTime() - right.occurredAt.getTime();
      if (time !== 0) {
        return time;
      }
      return left.type.localeCompare(right.type);
    })
    .slice(0, TIMELINE_LIMIT)
    .map((event) => ({
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      label: event.label,
      detail: event.detail,
    }));
}

function mapReviewActionItem(
  action: Prisma.BookingPaymentReviewActionGetPayload<{
    include: { actorUser: { select: { name: true; email: true } } };
  }>
): PaymentReviewActionItem {
  return {
    id: action.id,
    action: action.action,
    actorDisplayName: action.actorUser?.name?.trim() || action.actorUser?.email || null,
    actorRole: action.actorRole,
    note: action.note,
    resolution: action.resolution,
    createdAt: action.createdAt.toISOString(),
  };
}

function mapProviderEvents(
  events: Array<Prisma.PaymentWebhookEventGetPayload<{ select: {
    id: true;
    eventTopic: true;
    eventAction: true;
    status: true;
    lastErrorCode: true;
    attemptCount: true;
    createdAt: true;
    processedAt: true;
  } }>>
): ProviderEventSummaryItem[] {
  return events.map((event) => ({
    id: event.id,
    topic: event.eventTopic,
    action: event.eventAction,
    status: mapProviderEventStatus(event.status),
    lastSafeErrorCode: event.lastErrorCode,
    attemptCount: event.attemptCount,
    receivedAt: event.createdAt.toISOString(),
    processedAt: toIso(event.processedAt),
  }));
}

export async function getBarbershopPaymentReviewDetail(input: {
  barbershopId: string;
  reviewId: string;
}): Promise<PaymentReviewDetail> {
  const review = await prisma.bookingPaymentReview.findFirst({
    where: {
      id: input.reviewId,
      barbershopId: input.barbershopId,
    },
    include: {
      assignedToUser: {
        select: { name: true, email: true },
      },
      bookingPayment: {
        include: {
          appointment: {
            select: {
              id: true,
              publicReference: true,
              clientName: true,
              startAt: true,
              endAt: true,
              serviceName: true,
              status: true,
            },
          },
          webhookEvents: {
            select: {
              id: true,
              eventTopic: true,
              eventAction: true,
              status: true,
              lastErrorCode: true,
              attemptCount: true,
              createdAt: true,
              processedAt: true,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 10,
          },
        },
      },
      actions: {
        include: {
          actorUser: {
            select: { name: true, email: true },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!review) {
    throw new AppError(404, 'NOT_FOUND', 'Payment review not found');
  }

  const timeline = await getPaymentTimelineForPayment(review.bookingPaymentId);

  return {
    id: review.id,
    payment: {
      id: review.bookingPayment.id,
      amountCents: review.bookingPayment.amountCents,
      currency: review.bookingPayment.currency,
      status: review.bookingPayment.status,
      providerStatus: review.bookingPayment.providerStatus,
      providerStatusDetail: review.bookingPayment.providerStatusDetail,
      approvedAt: toIso(review.bookingPayment.approvedAt),
      rejectedAt: toIso(review.bookingPayment.rejectedAt),
      cancelledAt: toIso(review.bookingPayment.cancelledAt),
      expiredAt: toIso(review.bookingPayment.expiredAt),
      reviewRequiredAt: toIso(review.bookingPayment.reviewRequiredAt),
    },
    appointment: {
      id: review.bookingPayment.appointment.id,
      publicReference: review.bookingPayment.appointment.publicReference,
      customerDisplayName: review.bookingPayment.appointment.clientName,
      serviceName: review.bookingPayment.appointment.serviceName,
      startAt: review.bookingPayment.appointment.startAt.toISOString(),
      endAt: review.bookingPayment.appointment.endAt.toISOString(),
      status: review.bookingPayment.appointment.status,
    },
    review: {
      status: review.status,
      reason: review.reason,
      resolution: review.resolution,
      openedAt: review.openedAt.toISOString(),
      startedAt: toIso(review.startedAt),
      resolvedAt: toIso(review.resolvedAt),
      assignedToDisplayName: review.assignedToUser?.name?.trim() || review.assignedToUser?.email || null,
      latestNote: review.latestNote,
    },
    timeline,
    actions: review.actions.map(mapReviewActionItem),
    providerEvents: mapProviderEvents(review.bookingPayment.webhookEvents),
    allowedActions: reviewStatusAllowsAction(review.status),
  };
}

async function loadReviewForMutation(input: {
  reviewId: string;
  barbershopId: string;
  actorUserId: string;
  db: PaymentReviewDb;
}) {
  const [actor, review] = await Promise.all([
    assertReviewActorBelongsToBarbershop(input.db, {
      actorUserId: input.actorUserId,
      barbershopId: input.barbershopId,
    }),
    input.db.bookingPaymentReview.findFirst({
      where: {
        id: input.reviewId,
        barbershopId: input.barbershopId,
      },
    }),
  ]);

  if (!review) {
    throw new AppError(404, 'NOT_FOUND', 'Payment review not found');
  }

  return { actor, review };
}

export async function startPaymentReview(input: {
  barbershopId: string;
  reviewId: string;
  actorUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const { actor, review } = await loadReviewForMutation({
      reviewId: input.reviewId,
      barbershopId: input.barbershopId,
      actorUserId: input.actorUserId,
      db: tx,
    });

    const updated = await tx.bookingPaymentReview.updateMany({
      where: { id: review.id, status: 'OPEN' },
      data: {
        status: 'IN_PROGRESS',
        startedAt: now,
        assignedToUserId: actor.id,
      },
    });

    if (updated.count === 0) {
      throw paymentReviewConflict('The payment review was already updated by another action');
    }

    await tx.bookingPaymentReviewAction.create({
      data: {
        barbershopId: input.barbershopId,
        reviewId: review.id,
        action: 'MARKED_IN_PROGRESS',
        actorUserId: actor.id,
        actorRole: actor.role,
        createdAt: now,
      },
    });
  });

  return getBarbershopPaymentReviewDetail({ barbershopId: input.barbershopId, reviewId: input.reviewId });
}

export async function addPaymentReviewNote(input: {
  barbershopId: string;
  reviewId: string;
  actorUserId: string;
  note: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const note = sanitizeNote(input.note);
  if (!note) {
    throw new BadRequestError('A review note is required');
  }

  await prisma.$transaction(async (tx) => {
    const { actor, review } = await loadReviewForMutation({
      reviewId: input.reviewId,
      barbershopId: input.barbershopId,
      actorUserId: input.actorUserId,
      db: tx,
    });

    if (review.status === 'RESOLVED') {
      throw paymentReviewConflict('Resolved payment reviews cannot receive additional notes');
    }

    await tx.bookingPaymentReview.update({
      where: { id: review.id },
      data: {
        latestNote: note,
        assignedToUserId: review.assignedToUserId ?? actor.id,
      },
    });

    await tx.bookingPaymentReviewAction.create({
      data: {
        barbershopId: input.barbershopId,
        reviewId: review.id,
        action: 'NOTE_ADDED',
        actorUserId: actor.id,
        actorRole: actor.role,
        note,
        createdAt: now,
      },
    });
  });

  return getBarbershopPaymentReviewDetail({ barbershopId: input.barbershopId, reviewId: input.reviewId });
}

export async function resolvePaymentReview(input: {
  barbershopId: string;
  reviewId: string;
  actorUserId: string;
  resolution: PaymentReviewResolution;
  note?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const note = sanitizeNote(input.note);
  if (input.resolution === 'OTHER' && !note) {
    throw new BadRequestError('A note is required when using the OTHER resolution');
  }

  await prisma.$transaction(async (tx) => {
    const { actor, review } = await loadReviewForMutation({
      reviewId: input.reviewId,
      barbershopId: input.barbershopId,
      actorUserId: input.actorUserId,
      db: tx,
    });

    const updated = await tx.bookingPaymentReview.updateMany({
      where: {
        id: review.id,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      data: {
        status: 'RESOLVED',
        resolution: input.resolution,
        resolvedAt: now,
        resolvedByUserId: actor.id,
        assignedToUserId: review.assignedToUserId ?? actor.id,
        latestNote: note ?? review.latestNote,
      },
    });

    if (updated.count === 0) {
      throw paymentReviewConflict('The payment review was already resolved or changed by another action');
    }

    await tx.bookingPaymentReviewAction.create({
      data: {
        barbershopId: input.barbershopId,
        reviewId: review.id,
        action: 'RESOLVED',
        actorUserId: actor.id,
        actorRole: actor.role,
        note,
        resolution: input.resolution,
        createdAt: now,
      },
    });
  });

  return getBarbershopPaymentReviewDetail({ barbershopId: input.barbershopId, reviewId: input.reviewId });
}

export async function reopenPaymentReview(input: {
  barbershopId: string;
  reviewId: string;
  actorUserId: string;
  note?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const note = sanitizeNote(input.note);

  await prisma.$transaction(async (tx) => {
    const { actor, review } = await loadReviewForMutation({
      reviewId: input.reviewId,
      barbershopId: input.barbershopId,
      actorUserId: input.actorUserId,
      db: tx,
    });

    const updated = await tx.bookingPaymentReview.updateMany({
      where: { id: review.id, status: 'RESOLVED' },
      data: {
        status: 'OPEN',
        resolution: null,
        resolvedAt: null,
        resolvedByUserId: null,
        startedAt: null,
        latestNote: note ?? review.latestNote,
      },
    });

    if (updated.count === 0) {
      throw paymentReviewConflict('Only resolved payment reviews can be reopened');
    }

    await tx.bookingPaymentReviewAction.create({
      data: {
        barbershopId: input.barbershopId,
        reviewId: review.id,
        action: 'REOPENED',
        actorUserId: actor.id,
        actorRole: actor.role,
        note,
        createdAt: now,
      },
    });
  });

  return getBarbershopPaymentReviewDetail({ barbershopId: input.barbershopId, reviewId: input.reviewId });
}

export async function getProviderEventSummariesForPayment(paymentId: string): Promise<ProviderEventSummaryItem[]> {
  const payment = await prisma.bookingPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      webhookEvents: {
        select: {
          id: true,
          eventTopic: true,
          eventAction: true,
          status: true,
          lastErrorCode: true,
          attemptCount: true,
          createdAt: true,
          processedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
      },
    },
  });

  return mapProviderEvents(payment.webhookEvents);
}
