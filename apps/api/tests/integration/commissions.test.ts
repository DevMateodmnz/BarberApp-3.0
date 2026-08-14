import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { createAppFromEnv } from '../../src/app.js';
import { addDaysToDateString, getLocalDateStringInTimeZone, getUtcRangeForLocalDate } from '../../src/lib/dateUtils.js';

const app = createAppFromEnv();
const timezone = 'America/Argentina/Tucuman';
const f = {} as {
  owner: string; barber: string; foreignOwner: string; foreignBarber: string;
  shop: string; foreignShop: string; employee: string; foreignEmployee: string;
  service: string;
};

const auth = (id: string) => ({ 'x-test-user-id': id });

async function cleanup() {
  await prisma.commissionEntry.deleteMany();
  await prisma.commissionLiquidation.deleteMany();
  await prisma.employeeCommissionPolicy.deleteMany();
  await prisma.loyaltyLedgerEvent.deleteMany();
  await prisma.loyaltyReward.deleteMany();
  await prisma.customerLoyaltySummary.deleteMany();
  await prisma.barbershopLoyaltyProgram.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
}

async function appointment(input: { employeeId?: string; shopId?: string; status?: 'IN_PROGRESS' | 'CANCELLED' | 'NO_SHOW'; price?: number } = {}) {
  const now = new Date();
  return prisma.appointment.create({
    data: {
      barbershopId: input.shopId ?? f.shop,
      employeeId: input.employeeId ?? f.employee,
      serviceId: f.service,
      clientName: 'Commission Client',
      serviceName: 'Commission Cut',
      servicePriceCents: input.price ?? 333,
      discountCents: 0,
      finalPriceCents: input.price ?? 333,
      serviceDurationMinutes: 30,
      serviceCurrency: 'ARS',
      startAt: new Date(now.getTime() - 3_600_000),
      endAt: new Date(now.getTime() - 1_800_000),
      status: input.status ?? 'IN_PROGRESS',
    },
  });
}

beforeAll(async () => {
  await cleanup();
  await prisma.employeeService.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();

  const [owner, barber, foreignOwner, foreignBarber] = await Promise.all([
    prisma.user.create({ data: { clerkUserId: 'commission_owner', email: 'commission-owner@test.com', role: 'OWNER' } }),
    prisma.user.create({ data: { clerkUserId: 'commission_barber', email: 'commission-barber@test.com', name: 'Barber One', role: 'BARBER' } }),
    prisma.user.create({ data: { clerkUserId: 'commission_foreign_owner', email: 'commission-foreign-owner@test.com', role: 'OWNER' } }),
    prisma.user.create({ data: { clerkUserId: 'commission_foreign_barber', email: 'commission-foreign-barber@test.com', role: 'BARBER' } }),
  ]);
  const shop = await prisma.barbershop.create({ data: { ownerId: owner.id, name: 'Commission Shop', timezone } });
  const foreignShop = await prisma.barbershop.create({ data: { ownerId: foreignOwner.id, name: 'Foreign Shop', timezone } });
  const employee = await prisma.employee.create({ data: { barbershopId: shop.id, userId: barber.id } });
  const foreignEmployee = await prisma.employee.create({ data: { barbershopId: foreignShop.id, userId: foreignBarber.id } });
  const service = await prisma.service.create({ data: { barbershopId: shop.id, name: 'Commission Cut', durationMinutes: 30, priceCents: 333, currency: 'ARS' } });
  f.owner = owner.clerkUserId; f.barber = barber.clerkUserId;
  f.foreignOwner = foreignOwner.clerkUserId; f.foreignBarber = foreignBarber.clerkUserId;
  f.shop = shop.id; f.foreignShop = foreignShop.id;
  f.employee = employee.id; f.foreignEmployee = foreignEmployee.id; f.service = service.id;
});

beforeEach(async () => {
  await cleanup();
  await prisma.barbershop.update({ where: { id: f.shop }, data: { defaultCommissionBasisPoints: 0 } });
});

afterAll(async () => {
  await cleanup();
  await prisma.employeeService.deleteMany();
  await prisma.service.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.barbershop.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

async function setOverride(rate: number | null, employeeId = f.employee) {
  return request(app)
    .put(`/api/v1/barbershops/${f.shop}/commissions/settings`)
    .set(auth(f.owner))
    .send({ defaultPercentageBasisPoints: 1_000, employeeOverrides: [{ employeeId, percentageBasisPoints: rate }] });
}

async function complete(id: string, clerkId = f.barber) {
  return request(app).put(`/api/v1/appointments/${id}/status`).set(auth(clerkId)).send({ status: 'COMPLETED' });
}

describe('commission settings and accrual', () => {
  it('allows owner settings, rejects foreign employees and barber mutation', async () => {
    expect((await setOverride(1_500)).status).toBe(200);
    expect((await setOverride(1_500, f.foreignEmployee)).status).toBe(404);
    const barber = await request(app)
      .put(`/api/v1/barbershops/${f.shop}/commissions/settings`)
      .set(auth(f.barber))
      .send({ defaultPercentageBasisPoints: 1_000, employeeOverrides: [] });
    expect(barber.status).toBe(403);
    await prisma.employee.update({ where: { id: f.employee }, data: { isActive: false } });
    expect((await setOverride(2_000)).status).toBe(400);
    await prisma.employee.update({ where: { id: f.employee }, data: { isActive: true } });
  });

  it('completion creates exactly one snapped accrual with half-up rounding', async () => {
    await setOverride(1_500);
    const item = await appointment();
    expect((await complete(item.id)).status).toBe(200);
    expect((await complete(item.id)).status).toBe(400);
    const rows = await prisma.commissionEntry.findMany({ where: { appointmentId: item.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ grossAmountCents: 333, percentageBasisPoints: 1_500, commissionAmountCents: 50 });
  });

  it('uses shop default, and later configuration changes do not rewrite history', async () => {
    await setOverride(null);
    const item = await appointment({ price: 1_001 });
    await complete(item.id);
    await setOverride(4_000);
    expect(await prisma.commissionEntry.findFirst({ where: { appointmentId: item.id } })).toMatchObject({ percentageBasisPoints: 1_000, commissionAmountCents: 100 });
  });

  it('does not accrue for cancelled or no-show appointments', async () => {
    await appointment({ status: 'CANCELLED' });
    await appointment({ status: 'NO_SHOW' });
    expect(await prisma.commissionEntry.count()).toBe(0);
  });
});

describe('overview isolation and liquidation lifecycle', () => {
  async function seedAccruals(count = 2) {
    await setOverride(2_500);
    for (let index = 0; index < count; index += 1) {
      const item = await appointment({ price: 1_000 + index * 100 });
      expect((await complete(item.id)).status).toBe(200);
    }
    const date = getLocalDateStringInTimeZone(timezone);
    return { dateFrom: date, dateTo: date };
  }

  it('serves owner overview and barber own overview but forbids selecting another barber', async () => {
    const range = await seedAccruals();
    const owner = await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/overview`).query({ ...range, employeeId: f.employee }).set(auth(f.owner));
    expect(owner.status).toBe(200);
    expect(owner.body.data.summary).toMatchObject({ grossAmountCents: 2_100, commissionAmountCents: 525, unsettledAmountCents: 525 });
    const own = await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/me`).query({ ...range, employeeId: f.foreignEmployee }).set(auth(f.barber));
    expect(own.status).toBe(200);
    expect(own.body.data.employeeId).toBe(f.employee);
    expect((await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/overview`).query({ ...range, employeeId: f.employee }).set(auth(f.barber))).status).toBe(403);
  });

  it('previews and transactionally creates from eligible server-side entries with retry safety', async () => {
    const range = await seedAccruals();
    const preview = await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/liquidations/preview`).query({ ...range, employeeId: f.employee }).set(auth(f.owner));
    expect(preview.body.data).toMatchObject({ entryCount: 2, commissionAmountCents: 525 });
    const body = { ...range, employeeId: f.employee, idempotencyKey: 'commission-retry-1' };
    const [first, retry] = await Promise.all([
      request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send(body),
      request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send(body),
    ]);
    expect(first.status).toBe(201); expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(first.body.data).toMatchObject({ grossAmountCents: 2_100, commissionAmountCents: 525, entryCount: 2 });
    expect(await prisma.commissionLiquidation.count()).toBe(1);
    expect((await request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send({ ...body, idempotencyKey: 'commission-retry-2', commissionAmountCents: 1 })).status).toBe(400);
  });

  it('allows only one concurrent liquidation to claim the same entries', async () => {
    const range = await seedAccruals();
    const create = (idempotencyKey: string) => request(app)
      .post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`)
      .set(auth(f.owner))
      .send({ ...range, employeeId: f.employee, idempotencyKey });
    const results = await Promise.all([
      create('commission-competing-1'),
      create('commission-competing-2'),
    ]);

    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect([400, 409]).toContain(results.find((result) => result.status !== 201)?.status);
    expect(await prisma.commissionLiquidation.count()).toBe(1);
    expect(await prisma.commissionEntry.count({ where: { liquidationId: null } })).toBe(0);
  });

  it('uses inclusive local dates with an exclusive timezone-aware end boundary and bounded pages', async () => {
    const range = await seedAccruals();
    const entries = await prisma.commissionEntry.findMany({ orderBy: { id: 'asc' } });
    const { startUtc: exclusiveEnd } = getUtcRangeForLocalDate(addDaysToDateString(range.dateTo, 1), timezone);
    await prisma.commissionEntry.update({ where: { id: entries[1]!.id }, data: { earnedAt: exclusiveEnd } });
    const preview = await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/liquidations/preview`).query({ ...range, employeeId: f.employee }).set(auth(f.owner));
    expect(preview.body.data.entryCount).toBe(1);
    expect((await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/overview`).query({ ...range, employeeId: f.employee, limit: 101 }).set(auth(f.owner))).status).toBe(400);
  });

  it('marks paid idempotently, exposes barber history, and preserves paid immutability', async () => {
    const range = await seedAccruals(1);
    const created = await request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send({ ...range, employeeId: f.employee, idempotencyKey: 'commission-paid-1' });
    const url = `/api/v1/barbershops/${f.shop}/commissions/liquidations/${created.body.data.id}/pay`;
    expect((await request(app).post(url).set(auth(f.owner))).status).toBe(200);
    expect((await request(app).post(url).set(auth(f.owner))).body.data.status).toBe('PAID');
    expect((await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.barber))).body.data[0].status).toBe('PAID');
    expect((await request(app).post(url.replace('/pay', '/void')).set(auth(f.owner)).send({ reason: 'Cannot rewrite paid history' })).status).toBe(409);
    expect((await request(app).post(url).set(auth(f.barber))).status).toBe(403);
  });

  it('voids only open liquidations and releases their entries', async () => {
    const range = await seedAccruals(1);
    const created = await request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send({ ...range, employeeId: f.employee, idempotencyKey: 'commission-void-1' });
    const result = await request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations/${created.body.data.id}/void`).set(auth(f.owner)).send({ reason: 'Period selected incorrectly' });
    expect(result.body.data.status).toBe('VOIDED');
    expect(await prisma.commissionEntry.count({ where: { liquidationId: null } })).toBe(1);
  });

  it('serializes competing pay and void transitions without releasing paid entries', async () => {
    const range = await seedAccruals(1);
    const created = await request(app).post(`/api/v1/barbershops/${f.shop}/commissions/liquidations`).set(auth(f.owner)).send({ ...range, employeeId: f.employee, idempotencyKey: 'commission-state-race' });
    const baseUrl = `/api/v1/barbershops/${f.shop}/commissions/liquidations/${created.body.data.id}`;
    const results = await Promise.all([
      request(app).post(`${baseUrl}/pay`).set(auth(f.owner)),
      request(app).post(`${baseUrl}/void`).set(auth(f.owner)).send({ reason: 'Competing state transition' }),
    ]);

    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    const persisted = await prisma.commissionLiquidation.findUniqueOrThrow({
      where: { id: created.body.data.id },
      include: { entries: true },
    });
    if (persisted.status === 'PAID') {
      expect(persisted.entries).toHaveLength(1);
      expect(persisted.paidAt).not.toBeNull();
    } else {
      expect(persisted.status).toBe('VOIDED');
      expect(persisted.entries).toHaveLength(0);
      expect(await prisma.commissionEntry.count({ where: { liquidationId: null } })).toBe(1);
    }
  });

  it('hides foreign-tenant commission resources', async () => {
    const range = await seedAccruals(1);
    expect((await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/settings`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/barbershops/${f.shop}/commissions/overview`).query({ ...range, employeeId: f.employee }).set(auth(f.foreignOwner))).status).toBe(403);
    expect((await request(app).get(`/api/v1/barbershops/${f.foreignShop}/commissions/me`).query(range).set(auth(f.barber))).status).toBe(403);
  });
});
