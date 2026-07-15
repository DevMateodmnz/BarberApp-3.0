import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestData,
  createTestAppointment,
  createTestBarbershop,
  createTestEmployee,
  createTestEmployeeService,
  createTestService,
  prisma,
} from '../db/helpers';
import { EmailTransportError, type EmailTransport } from '../../src/lib/emailTransport.js';
import {
  claimDueAppointmentNotifications,
  processAppointmentNotificationBatch,
} from '../../src/services/appointmentNotificationService.js';

interface FixtureState {
  barbershopId: string;
  appointmentId: string;
}

const fixture = {} as FixtureState;

beforeAll(async () => {
  await cleanupTestData();
  const { barbershop } = await createTestBarbershop({ name: 'Worker Shop' });
  const { employee } = await createTestEmployee({ barbershopId: barbershop.id });
  const { service } = await createTestService({ barbershopId: barbershop.id, durationMinutes: 30 });
  await createTestEmployeeService({ employeeId: employee.id, serviceId: service.id });
  const appointment = await createTestAppointment({
    barbershopId: barbershop.id,
    employeeId: employee.id,
    serviceId: service.id,
    clientName: 'Worker Client',
    clientEmail: 'worker@example.com',
    startAt: new Date('2026-07-24T15:00:00.000Z'),
    endAt: new Date('2026-07-24T15:30:00.000Z'),
    status: 'CONFIRMED',
  });

  fixture.barbershopId = barbershop.id;
  fixture.appointmentId = appointment.id;
});

beforeEach(async () => {
  await prisma.appointmentNotification.deleteMany();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

async function createNotification(overrides: Record<string, unknown> = {}) {
  return prisma.appointmentNotification.create({
    data: {
      barbershopId: fixture.barbershopId,
      appointmentId: fixture.appointmentId,
      type: 'BOOKING_CONFIRMATION',
      channel: 'EMAIL',
      recipientEmail: 'worker@example.com',
      scheduledFor: new Date('2026-07-20T12:00:00.000Z'),
      nextAttemptAt: new Date('2026-07-20T12:00:00.000Z'),
      idempotencyKey: `appointment:${Math.random()}:BOOKING_CONFIRMATION:EMAIL`,
      payload: {
        customerName: 'Worker Client',
        barbershopName: 'Worker Shop',
        serviceName: 'Test Service',
        employeeName: 'Worker Barber',
        timezone: 'America/Argentina/Tucuman',
        startAt: '2026-07-24T15:00:00.000Z',
        publicSlug: null,
        publicReference: null,
      },
      ...overrides,
    },
  });
}

describe('appointment notification worker', () => {
  it('two workers cannot claim the same row', async () => {
    const notification = await createNotification();
    const now = new Date('2026-07-20T12:05:00.000Z');

    const [a, b] = await Promise.all([
      claimDueAppointmentNotifications({ now, batchSize: 1 }),
      claimDueAppointmentNotifications({ now, batchSize: 1 }),
    ]);

    const combined = [...a, ...b];
    expect(combined).toHaveLength(1);
    expect(combined[0]?.id).toBe(notification.id);
  });

  it('marks successful deliveries as SENT and does not redeliver them on repeated runs', async () => {
    await createNotification();
    const transport: EmailTransport = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 'smtp-1' }),
    };
    const now = new Date('2026-07-20T12:05:00.000Z');

    const first = await processAppointmentNotificationBatch({
      transport,
      now,
      batchSize: 5,
    });
    const second = await processAppointmentNotificationBatch({
      transport,
      now: new Date('2026-07-20T12:06:00.000Z'),
      batchSize: 5,
    });

    const rows = await prisma.appointmentNotification.findMany();
    expect(first.sent).toBe(1);
    expect(second.claimed).toBe(0);
    expect((transport.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(rows[0]?.status).toBe('SENT');
    expect(rows[0]?.providerMessageId).toBe('smtp-1');
  });

  it('retries temporary failures with bounded exponential backoff and sanitizes the error', async () => {
    const notification = await createNotification();
    const transport: EmailTransport = {
      send: vi.fn().mockRejectedValue(
        new EmailTransportError('SMTP temporary failure for worker@example.com', {
          retryable: true,
          code: 'ETIMEDOUT',
        })
      ),
    };
    const now = new Date('2026-07-20T12:05:00.000Z');

    const result = await processAppointmentNotificationBatch({
      transport,
      now,
      batchSize: 5,
    });

    const updated = await prisma.appointmentNotification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(result.retried).toBe(1);
    expect(updated.status).toBe('PENDING');
    expect(updated.attempts).toBe(1);
    expect(updated.nextAttemptAt.toISOString()).toBe('2026-07-20T12:06:00.000Z');
    expect(updated.lastError).toContain('[redacted-email]');
  });

  it('marks exhausted work as FAILED after the final attempt', async () => {
    const notification = await createNotification({ attempts: 3 });
    const transport: EmailTransport = {
      send: vi.fn().mockRejectedValue(
        new EmailTransportError('SMTP temporary failure', {
          retryable: true,
          code: 'ETIMEDOUT',
        })
      ),
    };

    const result = await processAppointmentNotificationBatch({
      transport,
      now: new Date('2026-07-20T12:05:00.000Z'),
      batchSize: 5,
    });

    const updated = await prisma.appointmentNotification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(result.failed).toBe(1);
    expect(updated.status).toBe('FAILED');
    expect(updated.attempts).toBe(4);
  });

  it('reclaims stale PROCESSING rows before delivering them', async () => {
    const notification = await createNotification({
      status: 'PROCESSING',
      lockToken: 'stale-lock',
      lockedAt: new Date('2026-07-20T11:00:00.000Z'),
    });
    const transport: EmailTransport = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 'smtp-stale' }),
    };

    const result = await processAppointmentNotificationBatch({
      transport,
      now: new Date('2026-07-20T12:05:00.000Z'),
      batchSize: 5,
      staleAfterMs: 60_000,
    });

    const updated = await prisma.appointmentNotification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(result.staleLocksReleased).toBe(1);
    expect(result.sent).toBe(1);
    expect(updated.status).toBe('SENT');
  });
});
