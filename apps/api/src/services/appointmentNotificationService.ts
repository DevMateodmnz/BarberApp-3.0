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
import { prisma } from '../lib/prisma.js';

export const REMINDER_24H_WINDOW_MS = 24 * 60 * 60_000;
export const APPOINTMENT_NOTIFICATION_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
export const APPOINTMENT_NOTIFICATION_MAX_ATTEMPTS = 4;
export const APPOINTMENT_NOTIFICATION_STALE_LOCK_MS = 10 * 60_000;
export const APPOINTMENT_NOTIFICATION_DEFAULT_BATCH_SIZE = 10;

export type NotificationDb = Prisma.TransactionClient | typeof prisma;

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

async function markClaimedNotificationSent(
  db: NotificationDb,
  input: {
    id: string;
    lockToken: string;
    sentAt: Date;
    providerMessageId: string | null;
  }
): Promise<void> {
  await db.appointmentNotification.updateMany({
    where: {
      id: input.id,
      lockToken: input.lockToken,
      status: 'PROCESSING',
    },
    data: {
      status: 'SENT',
      sentAt: input.sentAt,
      providerMessageId: input.providerMessageId,
      lastError: null,
      lockToken: null,
      lockedAt: null,
    },
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
    lockToken: string;
    currentAttempts: number;
    now: Date;
    error: unknown;
  }
): Promise<'retried' | 'failed'> {
  const nextAttempts = input.currentAttempts + 1;
  const lastError = sanitizeNotificationErrorMessage(input.error);
  const retryable = isRetryableDeliveryError(input.error);
  const nextAttemptAt = retryable
    ? buildRetryAttemptAt(input.now, nextAttempts)
    : null;

  if (retryable && nextAttempts < APPOINTMENT_NOTIFICATION_MAX_ATTEMPTS && nextAttemptAt) {
    await db.appointmentNotification.updateMany({
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
    return 'retried';
  }

  await db.appointmentNotification.updateMany({
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
      await markClaimedNotificationSent(db, {
        id: live.id,
        lockToken: row.lock_token,
        sentAt: now,
        providerMessageId: sendResult.providerMessageId,
      });
      result.sent += 1;
    } catch (error) {
      const outcome = await markClaimedNotificationFailure(db, {
        id: live.id,
        lockToken: row.lock_token,
        currentAttempts: live.attempts,
        now,
        error,
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
