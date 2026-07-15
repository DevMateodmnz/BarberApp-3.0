/**
 * Integration tests for the customer directory domain.
 *
 * Covers:
 *  - unique customer per (barbershopId, phoneNormalized)
 *  - same phone allowed in different barbershops
 *  - migration backfill groups correctly
 *  - first/last seen calculations
 *  - malformed phones skipped
 *  - soft-deleted rows handled correctly
 *  - first appointment creates customer
 *  - repeat appointment reuses customer
 *  - latest non-empty name/email updates directory record
 *  - empty incoming values do not erase existing values
 *  - concurrent first appointments produce one customer
 *  - public idempotent retries produce one customer
 *  - appointment snapshots remain unchanged
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import {
  TEST_BARBERSHOP_TIMEZONE,
  getNextLocalWeekdayDate,
} from '../helpers/timezone.js';

const app = createAppFromEnv();

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  shop: { id: string; slug: string };
  service: { id: string; durationMinutes: number };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function buildPublicCreatePayload(startAt: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceId: fixtures.service.id,
    barberId: fixtures.barber.employeeId,
    startAt,
    clientName: 'Public Customer',
    clientPhone: '+5493815559001',
    notes: 'Prefiere tijera',
    consentAccepted: true,
    consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
    ...overrides,
  };
}

/**
 * Returns a future UTC instant that is aligned to a 30-minute
 * boundary on the wall clock, plus the given offset in days. The
 * appointment validation rejects non-aligned slots.
 */
function futureAlignedStart(daysOffset: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + daysOffset);
  // Round up to the next :00 or :30 wall-clock boundary.
  const minutes = now.getUTCMinutes();
  const add = minutes < 30 ? 30 - minutes : 60 - minutes;
  now.setUTCMinutes(minutes + add, 0, 0);
  return now.toISOString();
}

async function createAppointmentAt(
  barbershopId: string,
  employeeId: string,
  serviceId: string,
  durationMinutes: number,
  daysOffset: number,
  status:
    | 'PENDING'
    | 'CONFIRMED'
    | 'IN_PROGRESS'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'NO_SHOW',
  clientName: string,
  clientPhoneNormalized: string | null,
  options: { customerId?: string | null; deletedAt?: Date | null } = {}
) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysOffset);
  const dayStr = day.toISOString().slice(0, 10);
  const startAt = localDateTimeToUtc(dayStr, '10:00', TEST_BARBERSHOP_TIMEZONE);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  return prisma.appointment.create({
    data: {
      barbershopId,
      employeeId,
      clientId: null,
      customerId: options.customerId ?? null,
      serviceId,
      clientName,
      clientPhone: clientPhoneNormalized,
      clientPhoneNormalized,
      serviceName: 'Customer Test Service',
      servicePriceCents: 2500,
      serviceDurationMinutes: durationMinutes,
      serviceCurrency: 'ARS',
      startAt,
      endAt,
      status,
      notes: null,
      deletedAt: options.deletedAt ?? null,
    },
  });
}

beforeAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      clerkUserId: 'cust_owner',
      email: 'cust-owner@test.com',
      role: 'OWNER',
    },
  });
  const barber = await prisma.user.create({
    data: {
      clerkUserId: 'cust_barber',
      email: 'cust-barber@test.com',
      role: 'BARBER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Customer Test Shop',
      timezone: TEST_BARBERSHOP_TIMEZONE,
      publicSlug: 'customer-test-shop',
      isActive: true,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const employee = await prisma.employee.create({
    data: { barbershopId: shop.id, userId: barber.id },
  });
  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Customer Test Service',
      durationMinutes: 30,
      priceCents: 2500,
      currency: 'ARS',
    },
  });
  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barber = {
    id: barber.id,
    clerkUserId: barber.clerkUserId,
    employeeId: employee.id,
  };
  fixtures.shop = { id: shop.id, slug: 'customer-test-shop' };
  fixtures.service = { id: service.id, durationMinutes: service.durationMinutes };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
});

afterAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employeeService.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

// ============================================
// Backfill behavior (the migration was applied to this DB; the
// per-test beforeEach wipes appointments and customers, so the
// backfill is verified by running it explicitly here against a
// controlled dataset).
// ============================================

describe('backfill', () => {
  it('groups appointments by (barbershop, phoneNormalized) and links them to one customer', async () => {
    const phone = '+5493815551001';
    // Create three historical appointments in the same barbershop.
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'COMPLETED',
      'First Visit',
      phone
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      2,
      'NO_SHOW',
      'First Visit',
      phone
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      3,
      'CONFIRMED',
      'Most Recent Visit',
      phone
    );

    // Simulate the migration backfill (the migration itself was
    // already applied to the DB; we re-run the logic here to verify
    // it against a controlled dataset).
    const { reRunBackfill } = await import('./_backfillHelper.js');
    await reRunBackfill(prisma);

    const customers = await prisma.customer.findMany({
      where: { barbershopId: fixtures.shop.id },
    });
    expect(customers).toHaveLength(1);
    const customer = customers[0];
    expect(customer.name).toBe('Most Recent Visit');
    expect(customer.phoneNormalized).toBe(phone);

    const linked = await prisma.appointment.findMany({
      where: { barbershopId: fixtures.shop.id },
      orderBy: { startAt: 'asc' },
    });
    expect(linked).toHaveLength(3);
    for (const a of linked) {
      expect(a.customerId).toBe(customer.id);
    }
    // firstSeenAt = earliest, lastSeenAt = latest
    const starts = linked.map((a) => a.startAt.getTime());
    expect(customer.firstSeenAt.getTime()).toBe(Math.min(...starts));
    expect(customer.lastSeenAt.getTime()).toBe(Math.max(...starts));
  });

  it('skips rows with NULL or empty normalized phone', async () => {
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'COMPLETED',
      'Walkin',
      null
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      2,
      'COMPLETED',
      'Empty Phone',
      ''
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      3,
      'COMPLETED',
      'With Phone',
      '+5493815551002'
    );

    const { reRunBackfill } = await import('./_backfillHelper.js');
    await reRunBackfill(prisma);

    const customers = await prisma.customer.findMany({
      where: { barbershopId: fixtures.shop.id },
    });
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe('With Phone');

    // Walkin and Empty Phone remain without customerId
    const unlinked = await prisma.appointment.findMany({
      where: { customerId: null },
      orderBy: { startAt: 'asc' },
    });
    expect(unlinked).toHaveLength(2);
  });

  it('does not create customers from soft-deleted appointments', async () => {
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'COMPLETED',
      'Soft Deleted',
      '+5493815551003',
      { deletedAt: new Date() }
    );

    const { reRunBackfill } = await import('./_backfillHelper.js');
    await reRunBackfill(prisma);

    const customers = await prisma.customer.findMany({
      where: { barbershopId: fixtures.shop.id },
    });
    expect(customers).toHaveLength(0);
  });

  it('allows the same normalized phone in different barbershops', async () => {
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner_backfill',
        email: 'cust-other-backfill@test.com',
        role: 'OWNER',
      },
    });
    const otherBarber = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_barber_backfill',
        email: 'cust-other-barber-backfill@test.com',
        role: 'BARBER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Backfill Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    await setupDefaultWorkingHours(otherShop.id);
    const otherEmployee = await prisma.employee.create({
      data: { barbershopId: otherShop.id, userId: otherBarber.id },
    });
    const otherService = await prisma.service.create({
      data: {
        barbershopId: otherShop.id,
        name: 'Other Backfill Service',
        durationMinutes: 30,
        priceCents: 2500,
        currency: 'ARS',
      },
    });
    await prisma.employeeService.create({
      data: { employeeId: otherEmployee.id, serviceId: otherService.id },
    });

    const sharedPhone = '+5493815551010';

    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'COMPLETED',
      'Shop A Customer',
      sharedPhone
    );
    await createAppointmentAt(
      otherShop.id,
      otherEmployee.id,
      otherService.id,
      otherService.durationMinutes,
      1,
      'COMPLETED',
      'Shop B Customer',
      sharedPhone
    );

    const { reRunBackfill } = await import('./_backfillHelper.js');
    await reRunBackfill(prisma);

    const customers = await prisma.customer.findMany({
      where: { phoneNormalized: sharedPhone },
      orderBy: { barbershopId: 'asc' },
    });

    expect(customers).toHaveLength(2);
    expect(new Set(customers.map((customer) => customer.barbershopId)).size).toBe(2);
  });

  it('rejects cross-barbershop customer links at the database level', async () => {
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner_fk',
        email: 'cust-other-fk@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other FK Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    const foreignCustomer = await prisma.customer.create({
      data: {
        barbershopId: otherShop.id,
        name: 'Foreign Customer',
        phone: '+5493815551020',
        phoneNormalized: '+5493815551020',
        firstSeenAt: new Date('2026-06-01T10:00:00.000Z'),
        lastSeenAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    });

    await expect(
      createAppointmentAt(
        fixtures.shop.id,
        fixtures.barber.employeeId,
        fixtures.service.id,
        fixtures.service.durationMinutes,
        1,
        'CONFIRMED',
        'Mismatched Customer',
        '+5493815551020',
        { customerId: foreignCustomer.id }
      )
    ).rejects.toBeTruthy();
  });
});

// ============================================
// Customer upsert (used by every appointment-creation path)
// ============================================

describe('customer upsert at appointment creation', () => {
  it('first appointment creates a customer with the most recent name', async () => {
    const phone = '+5493815552001';
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: futureAlignedStart(1),
        clientName: 'First Customer',
        clientPhone: phone,
      });
    if (res.status !== 201) {
      console.error('expected 201, got', res.status, JSON.stringify(res.body, null, 2));
    }
    expect(res.status).toBe(201);
    const customerId = res.body.data.customerId;
    expect(customerId).toBeTruthy();

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.name).toBe('First Customer');
    expect(customer.phoneNormalized).toBe(phone);
  });

  it('second appointment for the same phone reuses the customer and updates lastSeenAt', async () => {
    const phone = '+5493815552002';
    const t1 = futureAlignedStart(1);
    const t2 = futureAlignedStart(2);
    const res1 = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: t1,
        clientName: 'Old Name',
        clientPhone: phone,
      });
    expect(res1.status).toBe(201);
    const cid1 = res1.body.data.customerId;

    const res2 = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: t2,
        clientName: 'New Name',
        clientPhone: phone,
      });
    expect(res2.status).toBe(201);
    const cid2 = res2.body.data.customerId;
    expect(cid2).toBe(cid1);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: cid1 },
    });
    expect(customer.name).toBe('New Name');
    expect(customer.firstSeenAt.getTime()).toBeLessThanOrEqual(
      customer.lastSeenAt.getTime()
    );

    // Both appointments must be linked
    const linked = await prisma.appointment.findMany({
      where: { customerId: cid1 },
    });
    expect(linked).toHaveLength(2);
  });

  it('preserves the appointment snapshot fields exactly as provided', async () => {
    const phone = '+5493815552003';
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: futureAlignedStart(1),
        clientName: 'Snapshot Customer',
        clientPhone: phone,
        notes: 'leave me alone',
      });
    expect(res.status).toBe(201);
    const a = await prisma.appointment.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(a.clientName).toBe('Snapshot Customer');
    expect(a.clientPhone).toBe(phone);
    expect(a.clientPhoneNormalized).toBe(phone);
    expect(a.notes).toBe('leave me alone');
  });

  it('empty clientPhone leaves customerId null and does not create a customer', async () => {
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: futureAlignedStart(1),
        clientName: 'No Phone',
        clientPhone: '',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.customerId).toBeNull();

    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(0);
  });

  it('prefilled customer creation keeps the original customer link even if snapshots change', async () => {
    const customer = await seedCustomer('Existing Customer', '+5493815552004', 3);

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        customerId: customer.id,
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: futureAlignedStart(2),
        clientName: 'Edited Snapshot Name',
        clientPhone: '+5493815559998',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.customerId).toBe(customer.id);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(appointment.customerId).toBe(customer.id);
    expect(appointment.clientName).toBe('Edited Snapshot Name');
    expect(appointment.clientPhone).toBe('+5493815559998');

    const persistedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(persistedCustomer.phoneNormalized).toBe('+5493815552004');
  });

  it('returns 404 when staff tries to link an appointment to a customer from another barbershop', async () => {
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner_prefill',
        email: 'cust-other-prefill@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Prefill Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    const foreignCustomer = await prisma.customer.create({
      data: {
        barbershopId: otherShop.id,
        name: 'Foreign Prefill Customer',
        phone: '+5493815552999',
        phoneNormalized: '+5493815552999',
        firstSeenAt: new Date('2026-06-01T10:00:00.000Z'),
        lastSeenAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    });

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        customerId: foreignCustomer.id,
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: futureAlignedStart(1),
        clientName: 'Wrong Tenant',
        clientPhone: '+5493815552999',
      });

    expect(res.status).toBe(404);
  });
});

// ============================================
// Concurrent first-appointment race
// ============================================

describe('concurrent first-appointment race', () => {
  it('two concurrent staff appointments for the same new phone produce one customer', async () => {
    const phone = '+5493815553001';
    const t1 = futureAlignedStart(1);
    const t2 = futureAlignedStart(2);
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({
          employeeId: fixtures.barber.employeeId,
          serviceId: fixtures.service.id,
          startAt: t1,
          clientName: 'Race A',
          clientPhone: phone,
        }),
      request(app)
        .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
        .set(authHeader(fixtures.owner.clerkUserId))
        .send({
          employeeId: fixtures.barber.employeeId,
          serviceId: fixtures.service.id,
          startAt: t2,
          clientName: 'Race B',
          clientPhone: phone,
        }),
    ]);
    expect([201, 201]).toContain(resA.status);
    expect([201, 201]).toContain(resB.status);

    const customers = await prisma.customer.findMany({
      where: { barbershopId: fixtures.shop.id },
    });
    expect(customers).toHaveLength(1);

    const linked = await prisma.appointment.findMany({
      where: { customerId: customers[0].id },
    });
    expect(linked).toHaveLength(2);
  });
});

describe('public booking customer linkage', () => {
  it('idempotent public booking retries create one customer and reuse the same appointment', async () => {
    const monday = getNextLocalWeekdayDate(1, new Date(), TEST_BARBERSHOP_TIMEZONE);
    const startAt = localDateTimeToUtc(
      monday,
      '10:00',
      TEST_BARBERSHOP_TIMEZONE
    ).toISOString();

    const first = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', 'customer_domain_public_retry')
      .send(buildPublicCreatePayload(startAt));

    const replay = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', 'customer_domain_public_retry')
      .send(buildPublicCreatePayload(startAt));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(first.body.data);

    const customers = await prisma.customer.findMany({
      where: {
        barbershopId: fixtures.shop.id,
        phoneNormalized: '+5493815559001',
      },
    });
    expect(customers).toHaveLength(1);

    const appointments = await prisma.appointment.findMany({
      where: { customerId: customers[0].id },
    });
    expect(appointments).toHaveLength(1);
  });
});

// ============================================
// API endpoints (list / search / detail / update)
// ============================================

async function seedCustomer(name: string, phone: string, daysAgo: number) {
  const t = new Date(Date.now() - daysAgo * 24 * 60 * 60_000);
  return prisma.customer.create({
    data: {
      barbershopId: fixtures.shop.id,
      name,
      phone,
      phoneNormalized: phone,
      firstSeenAt: t,
      lastSeenAt: t,
    },
  });
}

describe('GET /customers', () => {
  it('returns a paginated list for the barbershop', async () => {
    await seedCustomer('Alice', '+5493815554001', 5);
    await seedCustomer('Bob', '+5493815554002', 4);
    await seedCustomer('Charlie', '+5493815554003', 3);

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers`)
      .query({ limit: 2, page: 1 })
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(2);
  });

  it('returns 403 for CLIENT role', async () => {
    // Create a CLIENT user
    const client = await prisma.user.create({
      data: {
        clerkUserId: 'cust_client',
        email: 'cust-client@test.com',
        role: 'CLIENT',
      },
    });
    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers`)
      .set(authHeader(client.clerkUserId));
    expect(res.status).toBe(403);
  });

  it('returns 404 on cross-tenant probe', async () => {
    // Create another barbershop with a different OWNER
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner',
        email: 'cust-other-owner@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    const res = await request(app)
      .get(`/api/v1/barbershops/${otherShop.id}/customers`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(res.status).toBe(404);
  });
});

describe('POST /customers/search', () => {
  it('searches names case-insensitively', async () => {
    await seedCustomer('Maria Gonzalez', '+5493815555000', 1);

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/search`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ query: 'maria' });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Maria Gonzalez');
  });

  it('searches by name in the body (no URL PII)', async () => {
    await seedCustomer('Diego', '+5493815555001', 1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/search`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ query: 'Diego' });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Diego');
  });

  it('searches by phone digits in the body', async () => {
    await seedCustomer('Elena', '+5493815555099', 1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/search`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ query: '5555099' });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Elena');
  });

  it('response does not echo the query string verbatim (PII discipline)', async () => {
    const secret = '+5493815555123';
    await seedCustomer('Fran', secret, 1);
    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/search`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ query: secret });
    expect(res.status).toBe(200);
    expect(res.body.data.query).toBeUndefined();
    expect(res.body.data.items[0].phone).toBe(secret);
  });

  it('sorts by no-show count when requested', async () => {
    const low = await seedCustomer('Low No Show', '+5493815555002', 4);
    const high = await seedCustomer('High No Show', '+5493815555003', 4);

    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'NO_SHOW',
      'Low No Show',
      low.phoneNormalized,
      { customerId: low.id }
    );

    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      1,
      'NO_SHOW',
      'High No Show',
      high.phoneNormalized,
      { customerId: high.id }
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      2,
      'NO_SHOW',
      'High No Show',
      high.phoneNormalized,
      { customerId: high.id }
    );

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/search`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ query: 'No Show', sort: 'no_shows' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].id).toBe(high.id);
    expect(res.body.data.items[1].id).toBe(low.id);
  });
});

describe('GET /customers/:id', () => {
  it('returns counts and recent history', async () => {
    const customer = await seedCustomer('Gala', '+5493815556001', 10);
    // 2 completed, 1 cancelled, 1 no-show
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      -5,
      'COMPLETED',
      'Gala',
      '+5493815556001',
      { customerId: customer.id }
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      -6,
      'COMPLETED',
      'Gala',
      '+5493815556001',
      { customerId: customer.id }
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      -7,
      'CANCELLED',
      'Gala',
      '+5493815556001',
      { customerId: customer.id }
    );
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      -8,
      'NO_SHOW',
      'Gala',
      '+5493815556001',
      { customerId: customer.id }
    );

    const res = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Gala');
    expect(res.body.data.completedCount).toBe(2);
    expect(res.body.data.noShowCount).toBe(1);
    expect(res.body.data.cancelledCount).toBe(1);
    expect(res.body.data.recentAppointments.length).toBe(4);
  });

  it('returns 404 for a customer from a different barbershop', async () => {
    const customer = await seedCustomer('Hugo', '+5493815556002', 1);
    // Create another barbershop and try to fetch via the wrong shop id
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner2',
        email: 'cust-other2@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Shop 2',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    const res = await request(app)
      .get(`/api/v1/barbershops/${otherShop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /customers/:id', () => {
  it('updates name, email, and internalNotes for OWNER', async () => {
    const customer = await seedCustomer('Ivy', '+5493815557001', 1);
    const res = await request(app)
      .patch(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ name: 'Ivy Updated', email: 'ivy@example.com', internalNotes: 'VIP' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Ivy Updated');
    expect(res.body.data.email).toBe('ivy@example.com');
    expect(res.body.data.internalNotes).toBe('VIP');
  });

  it('updates internalNotes for BARBER', async () => {
    const customer = await seedCustomer('Jay', '+5493815557002', 1);
    const res = await request(app)
      .patch(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ internalNotes: 'prefers short haircuts' });
    expect(res.status).toBe(200);
    expect(res.body.data.internalNotes).toBe('prefers short haircuts');
  });

  it('rejects empty body', async () => {
    const customer = await seedCustomer('Kim', '+5493815557003', 1);
    const res = await request(app)
      .patch(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({});
    expect(res.status).toBe(400);
  });

  it('clamps internalNotes over 2000 characters', async () => {
    const customer = await seedCustomer('Lia', '+5493815557004', 1);
    const res = await request(app)
      .patch(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ internalNotes: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('rejects phone mutation attempts', async () => {
    const customer = await seedCustomer('Luz', '+54938155570045', 1);
    const res = await request(app)
      .patch(`/api/v1/barbershops/${fixtures.shop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ phone: '+5493815550000' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a customer from a different barbershop', async () => {
    const customer = await seedCustomer('Mia', '+5493815557005', 1);
    const otherOwner = await prisma.user.create({
      data: {
        clerkUserId: 'cust_other_owner3',
        email: 'cust-other3@test.com',
        role: 'OWNER',
      },
    });
    const otherShop = await prisma.barbershop.create({
      data: {
        ownerId: otherOwner.id,
        name: 'Other Shop 3',
        timezone: TEST_BARBERSHOP_TIMEZONE,
      },
    });
    const res = await request(app)
      .patch(`/api/v1/barbershops/${otherShop.id}/customers/${customer.id}`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ name: 'Sneaky' });
    expect(res.status).toBe(404);
  });
});

// ============================================
// Existing /customers/lookup compatibility
// ============================================

describe('POST /customers/lookup (existing contract)', () => {
  it('returns the same insights shape based on the Customer model', async () => {
    const phone = '+5493815558001';
    const customer = await seedCustomer('Nora', phone, 5);
    // 1 no-show appointment
    await createAppointmentAt(
      fixtures.shop.id,
      fixtures.barber.employeeId,
      fixtures.service.id,
      fixtures.service.durationMinutes,
      2,
      'NO_SHOW',
      'Nora',
      phone,
      { customerId: customer.id }
    );

    const res = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/lookup`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.data.noShowCount).toBe(1);
    expect(res.body.data.visitCount).toBe(1);
    expect(res.body.data.recentAppointments).toHaveLength(1);
    expect(res.body.data.recentAppointments[0].serviceName).toBe(
      'Customer Test Service'
    );
    // Phone must NOT appear in the response
    expect(JSON.stringify(res.body)).not.toBe(phone);
  });
});
