import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';
import type {
  AppointmentNotificationChannel,
  AppointmentNotificationStatus,
  AppointmentNotificationType,
} from '@prisma/client';

import {
  buildAppointmentNotificationEmail,
  type AppointmentNotificationPayload,
} from '../lib/appointmentNotificationEmail.js';
import type {
  EmailTransport,
  EmailTransportError,
} from '../lib/emailTransport.js';
import { normalizeEmail } from '../lib/email.js';
import {
  AppError,
  BadRequestError,
  NotFoundError,
} from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const REMINDER_24H_WINDOW_MS = 24 * 60 * 60_000;
export const APPOINTMENT_NOTIFICATION_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
export const APPOINTMENT_NOTIFICATION_MAX_ATTEMPTS = 4;
export const APPOINTMENT_NOTIFICATION_STALE_LOCK_MS = 10 * 60_000;
export const APPOINTMENT_NOTIFICATION_DEFAULT_BATCH_SIZE = 10;
const APPOINTMENT_NOTIFICATION_DETAIL_ATTEMPT_LIMIT = 50;
const APPOINTMENT_NOTIFICATION_PROVIDER_HASH_LENGTH = 64;

export type NotificationDb = Prisma.TransactionClient | typeof prisma;
type NotificationWriteTx = Prisma.TransactionClient;

export const APPOINTMENT_NOTIFICATION_SUMMARY_SELECT = {
  id: true,
  type: true,
  channel: true,
  status: true,
  scheduledFor: true,
  attempts: true,
  sentAt: true,
  cancelledAt: true,
} satisfies Prisma.AppointmentNotificationSelect;

export const APPOINTMENT_WITH_NOTIFICATION_SUMMARY_INCLUDE = {
  barbershop: true,
  employee: true,
  client: true,
  service: true,
  notifications: {
    select: APPOINTMENT_NOTIFICATION_SUMMARY_SELECT,
    orderBy: [
      { scheduledFor: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
} satisfies Prisma.AppointmentInclude;

export interface ProcessAppointmentNotificationBatchResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  staleLocksReleased: number;
}

export interface NotificationOperationsSummary {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
  dueNow: number;
  retrying: number;
}

export interface NotificationOperationsListItem {
  id: string;
  appointmentId: string;
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  status: AppointmentNotificationStatus;
  scheduledFor: string;
  nextAttemptAt: string;
  attempts: number;
  manualRetryCount: number;
  sentAt: string | null;
  cancelledAt: string | null;
  customerDisplayName: string;
  maskedRecipient: string;
  serviceName: string;
  employeeName: string;
  appointmentStartAt: string;
}

export interface NotificationAttemptHistoryItem {
  id: string;
  attemptNumber: number;
  outcome: 'SENT' | 'TEMPORARY_FAILURE' | 'PERMANENT_FAILURE';
  attemptedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  sanitizedError: string | null;
  durationMs: number | null;
}

export interface NotificationOperationsDetail extends NotificationOperationsListItem {
  lastError: string | null;
  lastManualRetryAt: string | null;
  retryEligible: boolean;
  attemptsHistory: NotificationAttemptHistoryItem[];
}

export interface ListNotificationOperationsInput {
  barbershopId: string;
  status?: AppointmentNotificationStatus;
  type?: AppointmentNotificationType;
  channel?: AppointmentNotificationChannel;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
  sort: 'newest' | 'scheduled' | 'failed';
  ownerUserId: string;
}

export interface ListNotificationOperationsResult {
  items: NotificationOperationsListItem[];
  total: number;
  page: number;
  limit: number;
}

interface AppointmentNotificationContext {
  appointmentId: string;
  barbershopId: string;
  clientName: string;
  clientEmail: string | null;
  startAt: Date;
  publicReference: string | null;
  serviceName: string;
  barbershopName: string;
  timezone: string;
  publicSlug: string | null;
  employeeName: string;
}

interface NotificationListRow {
  id: string;
  appointmentId: string;
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  status: AppointmentNotificationStatus;
  recipientEmail: string;
  scheduledFor: Date;
  nextAttemptAt: Date;
  attempts: number;
  manualRetryCount: number;
  lastManualRetryAt: Date | null;
  lastError: string | null;
  sentAt: Date | null;
  cancelledAt: Date | null;
  appointment: {
    clientName: string;
    serviceName: string;
    startAt: Date;
    employee: {
      user: {
        name: string | null;
        email: string;
      };
    };
  };
}

interface ClaimedNotificationRow {
  id: string;
  barbershop_id: string;
  appointment_id: string;
  type: AppointmentNotificationType;
  channel: AppointmentNotificationChannel;
  status: AppointmentNotificationStatus;
  recipient_email: string;
  scheduled_for: Date;
  next_attempt_at: Date;
  attempts: number;
  lock_token: string | null;
  locked_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  cancelled_at: Date | null;
  provider_message_id: string | null;
  idempotency_key: string;
  payload: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
}

function sanitizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? normalizeEmail(trimmed) : null;
}

function hashOpaqueValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeOptionalErrorCode(error: unknown): string | null {
  if (error instanceof Error && error.name === 'EmailTransportError') {
    const code = (error as EmailTransportError).code?.trim();
    return code ? code.slice(0, 120) : null;
  }

  return null;
}

function maskRecipientEmail(value: string): string {
  const normalized = sanitizeEmail(value);
  if (!normalized) {
    return '***';
  }

  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) {
    return '***';
  }

  return `${localPart[0]}***@${domain}`;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toEmployeeDisplayName(value: { name: string | null; email: string }): string {
  return value.name?.trim() || value.email.trim();
}

async function runInNotificationWriteTx<T>(
  db: NotificationDb,
  callback: (tx: NotificationWriteTx) => Promise<T>
): Promise<T> {
  if ('$transaction' in db) {
    return db.$transaction(callback);
  }

  return callback(db);
}

function clampBatchSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value <= 0) {
    return APPOINTMENT_NOTIFICATION_DEFAULT_BATCH_SIZE;
  }

  return Math.min(value, 100);
}

function buildNotificationPayload(
  context: AppointmentNotificationContext
): Prisma.InputJsonObject & AppointmentNotificationPayload {
  return {
    customerName: context.clientName,
    barbershopName: context.barbershopName,
    serviceName: context.serviceName,
    employeeName: context.employeeName,
    timezone: context.timezone,
    startAt: context.startAt.toISOString(),
    publicSlug: context.publicSlug,
    publicReference: context.publicReference,
  };
}

function buildBookingConfirmationIdempotencyKey(appointmentId: string): string {
  return `appointment:${appointmentId}:BOOKING_CONFIRMATION:EMAIL`;
}

function buildReminder24hIdempotencyKey(
  appointmentId: string,
  scheduledFor: Date
): string {
  return `appointment:${appointmentId}:REMINDER_24H:EMAIL:${scheduledFor.toISOString()}`;
}

function computeReminder24hScheduledFor(startAt: Date, now: Date): Date | null {
  if (startAt.getTime() - now.getTime() <= REMINDER_24H_WINDOW_MS) {
    return null;
  }

  return new Date(startAt.getTime() - REMINDER_24H_WINDOW_MS);
}

function buildNotificationRows(
  context: AppointmentNotificationContext,
  now: Date
): Array<Prisma.AppointmentNotificationCreateManyInput> {
  const recipientEmail = sanitizeEmail(context.clientEmail);
  if (!recipientEmail) {
    return [];
  }

  const payload = buildNotificationPayload(context);
  const rows: Array<Prisma.AppointmentNotificationCreateManyInput> = [
    {
      barbershopId: context.barbershopId,
      appointmentId: context.appointmentId,
      type: 'BOOKING_CONFIRMATION',
      channel: 'EMAIL',
      status: 'PENDING',
      recipientEmail,
      scheduledFor: now,
      nextAttemptAt: now,
      attempts: 0,
      idempotencyKey: buildBookingConfirmationIdempotencyKey(context.appointmentId),
      payload: payload as Prisma.InputJsonObject,
    },
  ];

  const reminderScheduledFor = computeReminder24hScheduledFor(context.startAt, now);
  if (reminderScheduledFor) {
    rows.push({
      barbershopId: context.barbershopId,
      appointmentId: context.appointmentId,
      type: 'REMINDER_24H',
      channel: 'EMAIL',
      status: 'PENDING',
      recipientEmail,
      scheduledFor: reminderScheduledFor,
      nextAttemptAt: reminderScheduledFor,
      attempts: 0,
      idempotencyKey: buildReminder24hIdempotencyKey(
        context.appointmentId,
        reminderScheduledFor
      ),
      payload: payload as Prisma.InputJsonObject,
    });
  }

  return rows;
}

async function loadAppointmentNotificationContext(
  db: NotificationDb,
  appointmentId: string
): Promise<AppointmentNotificationContext> {
  const appointment = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      id: true,
      barbershopId: true,
      clientName: true,
      clientEmail: true,
      startAt: true,
      publicReference: true,
      serviceName: true,
      barbershop: {
        select: {
          name: true,
          timezone: true,
          publicSlug: true,
        },
      },
      employee: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return {
    appointmentId: appointment.id,
    barbershopId: appointment.barbershopId,
    clientName: appointment.clientName,
    clientEmail: sanitizeEmail(appointment.clientEmail),
    startAt: appointment.startAt,
    publicReference: appointment.publicReference,
    serviceName: appointment.serviceName,
    barbershopName: appointment.barbershop.name,
    timezone: appointment.barbershop.timezone,
    publicSlug: appointment.barbershop.publicSlug,
    employeeName:
      appointment.employee.user.name?.trim()
      || appointment.employee.user.email.trim(),
  };
}

async function assertOwnerCanAccessBarbershopNotifications(
  barbershopId: string,
  ownerUserId: string,
  db: NotificationDb = prisma
): Promise<void> {
  const shop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: { ownerId: true },
  });

  if (!shop || shop.ownerId !== ownerUserId) {
    throw new NotFoundError('Barbershop');
  }
}

function mapNotificationOperationsListItem(
  row: NotificationListRow
): NotificationOperationsListItem {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    type: row.type,
    channel: row.channel,
    status: row.status,
    scheduledFor: row.scheduledFor.toISOString(),
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    attempts: row.attempts,
    manualRetryCount: row.manualRetryCount,
    sentAt: toIsoString(row.sentAt),
    cancelledAt: toIsoString(row.cancelledAt),
    customerDisplayName: row.appointment.clientName,
    maskedRecipient: maskRecipientEmail(row.recipientEmail),
    serviceName: row.appointment.serviceName,
    employeeName: toEmployeeDisplayName(row.appointment.employee.user),
    appointmentStartAt: row.appointment.startAt.toISOString(),
  };
}

function sanitizeNotificationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Notification delivery failed';

  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/pb_[A-Z2-7]{20}/gu, '[redacted-reference]')
    .slice(0, 1000);
}

function getRetryDelayMs(attemptNumber: number): number | null {
  return APPOINTMENT_NOTIFICATION_RETRY_DELAYS_MS[attemptNumber - 1] ?? null;
}

function isRetryableDeliveryError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'EmailTransportError') {
    return (error as EmailTransportError).retryable;
  }

  return false;
}

function buildRetryAttemptAt(now: Date, attemptNumber: number): Date | null {
  const delayMs = getRetryDelayMs(attemptNumber);
  return delayMs === null ? null : new Date(now.getTime() + delayMs);
}

function notificationAllowsDelivery(input: {
  type: AppointmentNotificationType;
  appointmentStatus: string;
  appointmentStartAt: Date;
  now: Date;
}): boolean {
  if (
    input.appointmentStatus === 'CANCELLED'
    || input.appointmentStatus === 'COMPLETED'
    || input.appointmentStatus === 'NO_SHOW'
  ) {
    return false;
  }

  if (input.type === 'BOOKING_CONFIRMATION') {
    return true;
  }

  return input.appointmentStartAt.getTime() > input.now.getTime();
}

export async function scheduleAppointmentNotificationsForNewAppointment(
  db: NotificationDb,
  input: {
    appointmentId: string;
    now?: Date;
  }
): Promise<number> {
  const now = input.now ?? new Date();
  const context = await loadAppointmentNotificationContext(db, input.appointmentId);
  const rows = buildNotificationRows(context, now);

  if (rows.length === 0) {
    return 0;
  }

  const result = await db.appointmentNotification.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return result.count;
}

export async function syncAppointmentReminderAfterReschedule(
  db: NotificationDb,
  input: {
    appointmentId: string;
    now?: Date;
  }
): Promise<void> {
  const now = input.now ?? new Date();
  const context = await loadAppointmentNotificationContext(db, input.appointmentId);
  const recipientEmail = sanitizeEmail(context.clientEmail);
  const reminderScheduledFor = computeReminder24hScheduledFor(context.startAt, now);

  if (!recipientEmail || !reminderScheduledFor) {
    await db.appointmentNotification.updateMany({
      where: {
        appointmentId: context.appointmentId,
        barbershopId: context.barbershopId,
        type: 'REMINDER_24H',
        channel: 'EMAIL',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        lockToken: null,
        lockedAt: null,
      },
    });
    return;
  }

  const payload = buildNotificationPayload(context);
  const currentReminderKey = buildReminder24hIdempotencyKey(
    context.appointmentId,
    reminderScheduledFor
  );

  await db.appointmentNotification.createMany({
    data: [
      {
        barbershopId: context.barbershopId,
        appointmentId: context.appointmentId,
        type: 'REMINDER_24H',
        channel: 'EMAIL',
        status: 'PENDING',
        recipientEmail,
        scheduledFor: reminderScheduledFor,
        nextAttemptAt: reminderScheduledFor,
        attempts: 0,
        idempotencyKey: currentReminderKey,
        payload: payload as Prisma.InputJsonObject,
      },
    ],
    skipDuplicates: true,
  });

  await db.appointmentNotification.updateMany({
    where: {
      appointmentId: context.appointmentId,
      barbershopId: context.barbershopId,
      type: 'REMINDER_24H',
      channel: 'EMAIL',
      status: { in: ['PENDING', 'PROCESSING'] },
      idempotencyKey: { not: currentReminderKey },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      lockToken: null,
      lockedAt: null,
    },
  });
}

export async function cancelAppointmentNotifications(
  db: NotificationDb,
  input: {
    appointmentId: string;
    barbershopId: string;
    types: AppointmentNotificationType[];
    now?: Date;
  }
): Promise<number> {
  const now = input.now ?? new Date();
  const result = await db.appointmentNotification.updateMany({
    where: {
      appointmentId: input.appointmentId,
      barbershopId: input.barbershopId,
      type: { in: input.types },
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      lockToken: null,
      lockedAt: null,
    },
  });

  return result.count;
}

export async function listAppointmentNotificationSummaries(
  appointmentId: string,
  barbershopId: string,
  db: NotificationDb = prisma
) {
  return db.appointmentNotification.findMany({
    where: {
      appointmentId,
      barbershopId,
    },
    select: APPOINTMENT_NOTIFICATION_SUMMARY_SELECT,
    orderBy: [
      { scheduledFor: 'asc' },
      { createdAt: 'asc' },
    ],
  });
}

export async function releaseStaleProcessingNotifications(
  input: {
    now?: Date;
    staleAfterMs?: number;
    db?: NotificationDb;
  } = {}
): Promise<number> {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? APPOINTMENT_NOTIFICATION_STALE_LOCK_MS;
  const db = input.db ?? prisma;
  const staleBefore = new Date(now.getTime() - staleAfterMs);

  const result = await db.appointmentNotification.updateMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: 'PENDING',
      lockToken: null,
      lockedAt: null,
      nextAttemptAt: now,
    },
  });

  return result.count;
}

export async function claimDueAppointmentNotifications(
  input: {
    now?: Date;
    batchSize?: number;
    db?: NotificationDb;
  } = {}
): Promise<ClaimedNotificationRow[]> {
  const now = input.now ?? new Date();
  const batchSize = clampBatchSize(input.batchSize);
  const db = input.db ?? prisma;
  const lockToken = crypto.randomUUID();

  const rows = await db.$queryRaw<ClaimedNotificationRow[]>(Prisma.sql`
    WITH due_rows AS (
      SELECT an.id
      FROM appointment_notifications an
      WHERE an.status = CAST('PENDING' AS "AppointmentNotificationStatus")
        AND an.next_attempt_at <= ${now}
      ORDER BY an.next_attempt_at ASC, an.created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE appointment_notifications AS an
    SET status = CAST('PROCESSING' AS "AppointmentNotificationStatus"),
        lock_token = ${lockToken},
        locked_at = ${now},
        updated_at = NOW()
    FROM due_rows
    WHERE an.id = due_rows.id
    RETURNING
      an.id,
      an.barbershop_id,
      an.appointment_id,
      an.type,
      an.channel,
      an.status,
      an.recipient_email,
      an.scheduled_for,
      an.next_attempt_at,
      an.attempts,
      an.lock_token,
      an.locked_at,
      an.last_error,
      an.sent_at,
      an.cancelled_at,
      an.provider_message_id,
      an.idempotency_key,
      an.payload,
      an.created_at,
      an.updated_at
  `);

  return rows;
}

async function loadClaimedNotification(
  db: NotificationDb,
  id: string,
  lockToken: string
) {
  return db.appointmentNotification.findFirst({
    where: {
      id,
      lockToken,
      status: 'PROCESSING',
    },
    select: {
      id: true,
      type: true,
      channel: true,
      recipientEmail: true,
      idempotencyKey: true,
      attempts: true,
      barbershopId: true,
      payload: true,
      appointment: {
        select: {
          status: true,
          startAt: true,
        },
      },
    },
  });
}

async function createAttemptAuditRow(
  db: NotificationDb,
  input: {
    notificationId: string;
    barbershopId: string;
    attemptedAt: Date;
    completedAt: Date;
    workerToken: string;
    outcome: 'SENT' | 'TEMPORARY_FAILURE' | 'PERMANENT_FAILURE';
    providerMessageId?: string | null;
    errorCode?: string | null;
    sanitizedError?: string | null;
    durationMs: number;
  }
): Promise<void> {
  const maxAttempt = await db.appointmentNotificationAttempt.aggregate({
    where: {
      appointmentNotificationId: input.notificationId,
      barbershopId: input.barbershopId,
    },
    _max: {
      attemptNumber: true,
    },
  });

  await db.appointmentNotificationAttempt.create({
    data: {
      barbershopId: input.barbershopId,
      appointmentNotificationId: input.notificationId,
      attemptNumber: (maxAttempt._max.attemptNumber ?? 0) + 1,
      outcome: input.outcome,
      attemptedAt: input.attemptedAt,
      completedAt: input.completedAt,
      workerTokenHash: hashOpaqueValue(input.workerToken),
      providerMessageIdHash: input.providerMessageId
        ? hashOpaqueValue(input.providerMessageId).slice(
          0,
          APPOINTMENT_NOTIFICATION_PROVIDER_HASH_LENGTH
        )
        : null,
      errorCode: input.errorCode ?? null,
      sanitizedError: input.sanitizedError ?? null,
      durationMs: input.durationMs,
    },
  });
}

async function markClaimedNotificationSent(
  db: NotificationDb,
  input: {
    id: string;
    barbershopId: string;
    lockToken: string;
    attemptedAt: Date;
    sentAt: Date;
    providerMessageId: string | null;
    durationMs: number;
  }
): Promise<void> {
  await runInNotificationWriteTx(db, async (tx) => {
    await createAttemptAuditRow(tx, {
      notificationId: input.id,
      barbershopId: input.barbershopId,
      attemptedAt: input.attemptedAt,
      completedAt: input.sentAt,
      workerToken: input.lockToken,
      outcome: 'SENT',
      providerMessageId: input.providerMessageId,
      durationMs: input.durationMs,
    });

    await tx.appointmentNotification.updateMany({
      where: {
        id: input.id,
        lockToken: input.lockToken,
        status: 'PROCESSING',
      },
      data: {
        status: 'SENT',
        sentAt: input.sentAt,
        providerMessageId: input.providerMessageId
          ? hashOpaqueValue(input.providerMessageId).slice(
            0,
            APPOINTMENT_NOTIFICATION_PROVIDER_HASH_LENGTH
          )
          : null,
        lastError: null,
        lockToken: null,
        lockedAt: null,
      },
    });
  });
}

async function markClaimedNotificationCancelled(
  db: NotificationDb,
  input: {
    id: string;
    lockToken: string;
    now: Date;
  }
): Promise<void> {
  await db.appointmentNotification.updateMany({
    where: {
      id: input.id,
      lockToken: input.lockToken,
      status: 'PROCESSING',
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: input.now,
      lockToken: null,
      lockedAt: null,
    },
  });
}

async function markClaimedNotificationFailure(
  db: NotificationDb,
  input: {
    id: string;
    barbershopId: string;
    lockToken: string;
    currentAttempts: number;
    attemptedAt: Date;
    now: Date;
    error: unknown;
    durationMs: number;
  }
): Promise<'retried' | 'failed'> {
  const nextAttempts = input.currentAttempts + 1;
  const lastError = sanitizeNotificationErrorMessage(input.error);
  const errorCode = sanitizeOptionalErrorCode(input.error);
  const retryable = isRetryableDeliveryError(input.error);
  const nextAttemptAt = retryable
    ? buildRetryAttemptAt(input.now, nextAttempts)
    : null;

  if (retryable && nextAttempts < APPOINTMENT_NOTIFICATION_MAX_ATTEMPTS && nextAttemptAt) {
    await runInNotificationWriteTx(db, async (tx) => {
      await createAttemptAuditRow(tx, {
        notificationId: input.id,
        barbershopId: input.barbershopId,
        attemptedAt: input.attemptedAt,
        completedAt: input.now,
        workerToken: input.lockToken,
        outcome: 'TEMPORARY_FAILURE',
        errorCode,
        sanitizedError: lastError,
        durationMs: input.durationMs,
      });

      await tx.appointmentNotification.updateMany({
        where: {
          id: input.id,
          lockToken: input.lockToken,
          status: 'PROCESSING',
        },
        data: {
          status: 'PENDING',
          attempts: nextAttempts,
          nextAttemptAt,
          lastError,
          lockToken: null,
          lockedAt: null,
        },
      });
    });
    return 'retried';
  }

  await runInNotificationWriteTx(db, async (tx) => {
    await createAttemptAuditRow(tx, {
      notificationId: input.id,
      barbershopId: input.barbershopId,
      attemptedAt: input.attemptedAt,
      completedAt: input.now,
      workerToken: input.lockToken,
      outcome: 'PERMANENT_FAILURE',
      errorCode,
      sanitizedError: lastError,
      durationMs: input.durationMs,
    });

    await tx.appointmentNotification.updateMany({
      where: {
        id: input.id,
        lockToken: input.lockToken,
        status: 'PROCESSING',
      },
      data: {
        status: 'FAILED',
        attempts: nextAttempts,
        lastError,
        lockToken: null,
        lockedAt: null,
      },
    });
  });
  return 'failed';
}

export async function processAppointmentNotificationBatch(
  input: {
    transport: EmailTransport;
    publicWebBaseUrl?: string;
    now?: Date;
    batchSize?: number;
    staleAfterMs?: number;
    db?: NotificationDb;
  }
): Promise<ProcessAppointmentNotificationBatchResult> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  const staleLocksReleased = await releaseStaleProcessingNotifications({
    db,
    now,
    staleAfterMs: input.staleAfterMs,
  });
  const claimed = await claimDueAppointmentNotifications({
    db,
    now,
    batchSize: input.batchSize,
  });

  const result: ProcessAppointmentNotificationBatchResult = {
    claimed: claimed.length,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    staleLocksReleased,
  };

  for (const row of claimed) {
    if (!row.lock_token) {
      continue;
    }

    const live = await loadClaimedNotification(db, row.id, row.lock_token);
    if (!live) {
      continue;
    }

    const payload = live.payload as unknown as AppointmentNotificationPayload;
    const shouldDeliver = notificationAllowsDelivery({
      type: live.type,
      appointmentStatus: live.appointment.status,
      appointmentStartAt: live.appointment.startAt,
      now,
    });

    if (!shouldDeliver) {
      await markClaimedNotificationCancelled(db, {
        id: live.id,
        lockToken: row.lock_token,
        now,
      });
      result.cancelled += 1;
      continue;
    }

    const attemptedAt = new Date(now);

    try {
      const message = buildAppointmentNotificationEmail({
        type: live.type,
        channel: live.channel,
        idempotencyKey: live.idempotencyKey,
        recipientEmail: live.recipientEmail,
        payload,
        publicWebBaseUrl: input.publicWebBaseUrl,
      });
      const sendResult = await input.transport.send(message);
      const sentAt = new Date(now);
      await markClaimedNotificationSent(db, {
        id: live.id,
        barbershopId: live.barbershopId,
        lockToken: row.lock_token,
        attemptedAt,
        sentAt,
        providerMessageId: sendResult.providerMessageId,
        durationMs: Math.max(0, sentAt.getTime() - attemptedAt.getTime()),
      });
      result.sent += 1;
    } catch (error) {
      const completedAt = new Date(now);
      const outcome = await markClaimedNotificationFailure(db, {
        id: live.id,
        barbershopId: live.barbershopId,
        lockToken: row.lock_token,
        currentAttempts: live.attempts,
        attemptedAt,
        now: completedAt,
        error,
        durationMs: Math.max(0, completedAt.getTime() - attemptedAt.getTime()),
      });
      if (outcome === 'retried') {
        result.retried += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

function buildNotificationOperationsWhere(input: {
  barbershopId: string;
  status?: AppointmentNotificationStatus;
  type?: AppointmentNotificationType;
  channel?: AppointmentNotificationChannel;
  dateFrom?: Date;
  dateTo?: Date;
}): Prisma.AppointmentNotificationWhereInput {
  return {
    barbershopId: input.barbershopId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.channel ? { channel: input.channel } : {}),
    ...(
      input.dateFrom || input.dateTo
        ? {
            scheduledFor: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}
    ),
  };
}

function buildNotificationOperationsOrderBy(
  sort: 'newest' | 'scheduled' | 'failed'
): Prisma.AppointmentNotificationOrderByWithRelationInput[] {
  if (sort === 'scheduled') {
    return [
      { scheduledFor: 'asc' },
      { createdAt: 'asc' },
    ];
  }

  if (sort === 'failed') {
    return [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ];
  }

  return [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];
}

export async function getBarbershopNotificationOperationsSummary(input: {
  barbershopId: string;
  ownerUserId: string;
  now?: Date;
  db?: NotificationDb;
}): Promise<NotificationOperationsSummary> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  await assertOwnerCanAccessBarbershopNotifications(
    input.barbershopId,
    input.ownerUserId,
    db
  );

  const grouped = await db.appointmentNotification.groupBy({
    by: ['status'],
    where: {
      barbershopId: input.barbershopId,
    },
    _count: {
      _all: true,
    },
  });

  const base: NotificationOperationsSummary = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    dueNow: 0,
    retrying: 0,
  };

  for (const row of grouped) {
    const count = row._count._all;
    if (row.status === 'PENDING') base.pending = count;
    if (row.status === 'PROCESSING') base.processing = count;
    if (row.status === 'SENT') base.sent = count;
    if (row.status === 'FAILED') base.failed = count;
    if (row.status === 'CANCELLED') base.cancelled = count;
  }

  const [dueNow, retrying] = await Promise.all([
    db.appointmentNotification.count({
      where: {
        barbershopId: input.barbershopId,
        status: 'PENDING',
        nextAttemptAt: { lte: now },
      },
    }),
    db.appointmentNotification.count({
      where: {
        barbershopId: input.barbershopId,
        status: 'PENDING',
        attempts: { gt: 0 },
      },
    }),
  ]);

  base.dueNow = dueNow;
  base.retrying = retrying;

  return base;
}

export async function listBarbershopNotificationOperations(
  input: ListNotificationOperationsInput,
  db: NotificationDb = prisma
): Promise<ListNotificationOperationsResult> {
  await assertOwnerCanAccessBarbershopNotifications(
    input.barbershopId,
    input.ownerUserId,
    db
  );

  const where = buildNotificationOperationsWhere({
    barbershopId: input.barbershopId,
    status: input.status,
    type: input.type,
    channel: input.channel,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  const [total, rows] = await Promise.all([
    db.appointmentNotification.count({ where }),
    db.appointmentNotification.findMany({
      where,
      orderBy: buildNotificationOperationsOrderBy(input.sort),
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        appointmentId: true,
        type: true,
        channel: true,
        status: true,
        recipientEmail: true,
        scheduledFor: true,
        nextAttemptAt: true,
        attempts: true,
        manualRetryCount: true,
        lastManualRetryAt: true,
        lastError: true,
        sentAt: true,
        cancelledAt: true,
        appointment: {
          select: {
            clientName: true,
            serviceName: true,
            startAt: true,
            employee: {
              select: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    items: rows.map(mapNotificationOperationsListItem),
    total,
    page: input.page,
    limit: input.limit,
  };
}

export async function getBarbershopNotificationOperationsDetail(input: {
  barbershopId: string;
  notificationId: string;
  ownerUserId: string;
  db?: NotificationDb;
}): Promise<NotificationOperationsDetail> {
  const db = input.db ?? prisma;
  await assertOwnerCanAccessBarbershopNotifications(
    input.barbershopId,
    input.ownerUserId,
    db
  );

  const row = await db.appointmentNotification.findFirst({
    where: {
      id: input.notificationId,
      barbershopId: input.barbershopId,
    },
    select: {
      id: true,
      appointmentId: true,
      type: true,
      channel: true,
      status: true,
      recipientEmail: true,
      scheduledFor: true,
      nextAttemptAt: true,
      attempts: true,
      manualRetryCount: true,
      lastManualRetryAt: true,
      lastError: true,
      sentAt: true,
      cancelledAt: true,
      appointment: {
        select: {
          clientName: true,
          serviceName: true,
          startAt: true,
          employee: {
            select: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      deliveryAttempts: {
        orderBy: [
          { attemptNumber: 'desc' },
          { attemptedAt: 'desc' },
        ],
        take: APPOINTMENT_NOTIFICATION_DETAIL_ATTEMPT_LIMIT,
        select: {
          id: true,
          attemptNumber: true,
          outcome: true,
          attemptedAt: true,
          completedAt: true,
          errorCode: true,
          sanitizedError: true,
          durationMs: true,
        },
      },
    },
  });

  if (!row) {
    throw new NotFoundError('Notification');
  }

  const summary = mapNotificationOperationsListItem(row as NotificationListRow);
  return {
    ...summary,
    lastError: row.lastError,
    lastManualRetryAt: toIsoString(row.lastManualRetryAt),
    retryEligible: row.status === 'FAILED',
    attemptsHistory: row.deliveryAttempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      attemptedAt: attempt.attemptedAt.toISOString(),
      completedAt: toIsoString(attempt.completedAt),
      errorCode: attempt.errorCode,
      sanitizedError: attempt.sanitizedError,
      durationMs: attempt.durationMs,
    })),
  };
}

export async function retryFailedAppointmentNotification(input: {
  barbershopId: string;
  notificationId: string;
  ownerUserId: string;
  now?: Date;
  db?: NotificationDb;
}): Promise<NotificationOperationsListItem> {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  await assertOwnerCanAccessBarbershopNotifications(
    input.barbershopId,
    input.ownerUserId,
    db
  );

  const existing = await db.appointmentNotification.findFirst({
    where: {
      id: input.notificationId,
      barbershopId: input.barbershopId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existing) {
    throw new NotFoundError('Notification');
  }

  if (existing.status !== 'FAILED') {
    throw new BadRequestError(
      'Only failed notifications can be retried manually'
    );
  }

  const result = await db.appointmentNotification.updateMany({
    where: {
      id: input.notificationId,
      barbershopId: input.barbershopId,
      status: 'FAILED',
    },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      lastError: null,
      lockToken: null,
      lockedAt: null,
      manualRetryCount: {
        increment: 1,
      },
      lastManualRetryAt: now,
      lastManualRetryByUserId: input.ownerUserId,
    },
  });

  if (result.count !== 1) {
    throw new AppError(
      409,
      'NOTIFICATION_RETRY_CONFLICT',
      'The notification retry request conflicted with another update'
    );
  }

  const detail = await getBarbershopNotificationOperationsDetail({
    barbershopId: input.barbershopId,
    notificationId: input.notificationId,
    ownerUserId: input.ownerUserId,
    db,
  });

  return {
    id: detail.id,
    appointmentId: detail.appointmentId,
    type: detail.type,
    channel: detail.channel,
    status: detail.status,
    scheduledFor: detail.scheduledFor,
    nextAttemptAt: detail.nextAttemptAt,
    attempts: detail.attempts,
    manualRetryCount: detail.manualRetryCount,
    sentAt: detail.sentAt,
    cancelledAt: detail.cancelledAt,
    customerDisplayName: detail.customerDisplayName,
    maskedRecipient: detail.maskedRecipient,
    serviceName: detail.serviceName,
    employeeName: detail.employeeName,
    appointmentStartAt: detail.appointmentStartAt,
  };
}
