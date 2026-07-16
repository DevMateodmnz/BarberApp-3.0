import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createAppFromEnv } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { processCompletedAppointmentLoyalty, upsertLoyaltyProgram } from '../../src/services/loyaltyService.js';

const app = createAppFromEnv();
const TEST_TIMEZONE = 'America/Argentina/Tucuman';

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { id: string; clerkUserId: string; employeeId: string };
  shop: { id: string };
  service: { id: string; durationMinutes: number; priceCents: number; currency: string };
  customer: { id: string; phone: string };
  templatePromotion: { id: string };
}

const fixtures = {} as Fixtures;

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

async function createInProgressAppointment(localDate: string, localTime: string) {
  const startAt = localDateTimeToUtc(localDate, localTime, TEST_TIMEZONE);
  const endAt = new Date(startAt.getTime() + fixtures.service.durationMinutes * 60_000);

  return prisma.appointment.create({
    data: {
      barbershopId: fixtures.shop.id,
      employeeId: fixtures.barber.employeeId,
      clientId: null,
      customerId: fixtures.customer.id,
      serviceId: fixtures.service.id,
      clientName: 'Loyal Customer',
      clientPhone: fixtures.customer.phone,
      clientPhoneNormalized: fixtures.customer.phone,
      serviceName: 'Loyalty Cut',
      servicePriceCents: fixtures.service.priceCents,
      discountCents: 0,
      finalPriceCents: fixtures.service.priceCents,
      serviceDurationMinutes: fixtures.service.durationMinutes,
      serviceCurrency: fixtures.service.currency,
      startAt,
      endAt,
      status: 'IN_PROGRESS',
      startedAt: startAt,
    },
  });
}

beforeAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.loyaltyLedgerEvent.deleteMany();
  await prisma.loyaltyReward.deleteMany();
  await prisma.customerLoyaltySummary.deleteMany();
  await prisma.barbershopLoyaltyProgram.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.promotionCustomerUsage.deleteMany();
  await prisma.promotionService.deleteMany();
  await prisma.promotion.deleteMany();
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
      clerkUserId: 'loyalty_owner',
      email: 'loyalty-owner@test.com',
      name: 'Loyalty Owner',
      role: 'OWNER',
    },
  });
  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: 'loyalty_barber',
      email: 'loyalty-barber@test.com',
      name: 'Loyalty Barber',
      role: 'BARBER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: 'Loyalty Shop',
      timezone: TEST_TIMEZONE,
    },
  });
  await setupDefaultWorkingHours(shop.id);

  const employee = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberUser.id,
    },
  });

  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: 'Loyalty Cut',
      durationMinutes: 30,
      priceCents: 3000,
      currency: 'ARS',
    },
  });

  await prisma.employeeService.create({
    data: { employeeId: employee.id, serviceId: service.id },
  });

  const customer = await prisma.customer.create({
    data: {
      barbershopId: shop.id,
      name: 'Loyal Customer',
      phone: '+543811112222',
      phoneNormalized: '+543811112222',
      firstSeenAt: new Date('2026-07-01T12:00:00.000Z'),
      lastSeenAt: new Date('2026-07-01T12:00:00.000Z'),
    },
  });

  const templatePromotion = await prisma.promotion.create({
    data: {
      barbershopId: shop.id,
      name: 'Free loyalty cut',
      code: 'LOYALTYTEMPLATE',
      codeNormalized: 'LOYALTYTEMPLATE',
      discountType: 'FIXED',
      fixedDiscountCents: 1500,
      percentageBasisPoints: null,
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      endsAt: new Date('2027-07-01T00:00:00.000Z'),
      appliesToPublicBookings: true,
      appliesToStaffBookings: true,
      maxActiveRedemptions: null,
      maxRedemptionsPerCustomer: 1,
      minimumPriceCents: 0,
      serviceScope: 'ALL',
      createdByUserId: owner.id,
      updatedByUserId: owner.id,
    },
  });

  await upsertLoyaltyProgram(shop.id, owner.id, {
    isEnabled: true,
    visitsRequired: 2,
    rewardPromotionId: templatePromotion.id,
    rewardValidityDays: 30,
  });

  fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
  fixtures.barber = { id: barberUser.id, clerkUserId: barberUser.clerkUserId, employeeId: employee.id };
  fixtures.shop = { id: shop.id };
  fixtures.service = {
    id: service.id,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    currency: service.currency,
  };
  fixtures.customer = { id: customer.id, phone: customer.phoneNormalized };
  fixtures.templatePromotion = { id: templatePromotion.id };
});

beforeEach(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.loyaltyLedgerEvent.deleteMany();
  await prisma.loyaltyReward.deleteMany();
  await prisma.customerLoyaltySummary.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.promotionCustomerUsage.deleteMany();
  await prisma.promotionService.deleteMany({ where: { promotionId: { not: fixtures.templatePromotion.id } } });
  await prisma.promotion.deleteMany({ where: { id: { not: fixtures.templatePromotion.id } } });
  await prisma.appointment.deleteMany();
});

afterAll(async () => {
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.loyaltyLedgerEvent.deleteMany();
  await prisma.loyaltyReward.deleteMany();
  await prisma.customerLoyaltySummary.deleteMany();
  await prisma.barbershopLoyaltyProgram.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.promotionCustomerUsage.deleteMany();
  await prisma.promotionService.deleteMany();
  await prisma.promotion.deleteMany();
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

describe('loyalty earning and redemption', () => {
  it('issues one reward when the visit threshold is reached on completed appointments', async () => {
    const first = await createInProgressAppointment('2026-07-20', '10:00');
    const second = await createInProgressAppointment('2026-07-21', '10:00');

    const firstRes = await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });
    expect(firstRes.status).toBe(200);

    let summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentStampCount).toBe(1);
    expect(summary.body.data.availableRewardCount).toBe(0);
    expect(summary.body.data.lifetimeEligibleVisits).toBe(1);

    const secondRes = await request(app)
      .put(`/api/v1/appointments/${second.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });
    expect(secondRes.status).toBe(200);

    summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentStampCount).toBe(0);
    expect(summary.body.data.availableRewardCount).toBe(1);
    expect(summary.body.data.rewards).toHaveLength(1);
    expect(summary.body.data.rewards[0].code).toMatch(/^[A-Z0-9_-]{8,16}$/);

    const ledger = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/loyalty-ledger`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(ledger.status).toBe(200);
    expect(ledger.body.data.items.map((item: { eventType: string }) => item.eventType)).toContain('REWARD_ISSUED');
  });

  it('keeps stamp earning idempotent at the database boundary', async () => {
    const appointment = await createInProgressAppointment('2026-07-22', '10:00');

    await prisma.$transaction(async (tx) => {
      await processCompletedAppointmentLoyalty(tx, {
        appointmentId: appointment.id,
        barbershopId: fixtures.shop.id,
        customerId: fixtures.customer.id,
        userId: fixtures.owner.id,
        role: 'OWNER',
        now: new Date('2026-07-22T13:00:00.000Z'),
      });
      await processCompletedAppointmentLoyalty(tx, {
        appointmentId: appointment.id,
        barbershopId: fixtures.shop.id,
        customerId: fixtures.customer.id,
        userId: fixtures.owner.id,
        role: 'OWNER',
        now: new Date('2026-07-22T13:00:00.000Z'),
      });
    });

    const summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentStampCount).toBe(1);
    expect(summary.body.data.lifetimeEligibleVisits).toBe(1);
  });

  it('binds reward codes to the intended customer and consumes them once on staff booking', async () => {
    const first = await createInProgressAppointment('2026-07-23', '10:00');
    const second = await createInProgressAppointment('2026-07-24', '10:00');

    await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });
    await request(app)
      .put(`/api/v1/appointments/${second.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    const loyaltySummary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    const rewardCode = loyaltySummary.body.data.rewards[0].code as string;

    const quoteOk = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/promotions/quote`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        serviceId: fixtures.service.id,
        code: rewardCode,
        clientPhone: fixtures.customer.phone,
      });
    expect(quoteOk.status).toBe(200);
    expect(quoteOk.body.data.eligible).toBe(true);

    const quoteOther = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/promotions/quote`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        serviceId: fixtures.service.id,
        code: rewardCode,
        clientPhone: '+543899998888',
      });
    expect(quoteOther.status).toBe(200);
    expect(quoteOther.body.data.eligible).toBe(false);

    const created = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/appointments`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        employeeId: fixtures.barber.employeeId,
        serviceId: fixtures.service.id,
        startAt: localDateTimeToUtc('2026-07-25', '11:00', TEST_TIMEZONE).toISOString(),
        clientName: 'Loyal Customer',
        clientPhone: fixtures.customer.phone,
        promotionCode: rewardCode,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.discountCents).toBe(1500);
    expect(created.body.data.finalPriceCents).toBe(1500);

    const reward = await prisma.loyaltyReward.findFirstOrThrow({
      where: { customerId: fixtures.customer.id },
      orderBy: { issuedAt: 'desc' },
    });
    expect(reward.status).toBe('REDEEMED');
    expect(reward.redemptionAppointmentId).toBe(created.body.data.id);

    const afterRedeem = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(afterRedeem.body.data.availableRewardCount).toBe(0);

    const quoteSpent = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/promotions/quote`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({
        serviceId: fixtures.service.id,
        code: rewardCode,
        clientPhone: fixtures.customer.phone,
      });
    expect(quoteSpent.status).toBe(200);
    expect(quoteSpent.body.data.eligible).toBe(false);
  });

  it('keeps generated loyalty rewards out of the ordinary promotion list and summary', async () => {
    const first = await createInProgressAppointment('2026-07-23', '10:00');
    const second = await createInProgressAppointment('2026-07-24', '10:00');

    await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });
    await request(app)
      .put(`/api/v1/appointments/${second.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    const promotions = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/promotions`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(promotions.status).toBe(200);
    expect(promotions.body.data).toHaveLength(1);
    expect(promotions.body.data[0].id).toBe(fixtures.templatePromotion.id);

    const summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/promotions/summary`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.activePromotions).toBe(1);
    expect(summary.body.data.totalConsumedRedemptions).toBe(0);
  });

  it('returns matched customer loyalty details in the staff customer lookup response', async () => {
    const first = await createInProgressAppointment('2026-07-20', '10:00');
    const second = await createInProgressAppointment('2026-07-21', '10:00');

    await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });
    await request(app)
      .put(`/api/v1/appointments/${second.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    const lookup = await request(app)
      .post(`/api/v1/barbershops/${fixtures.shop.id}/customers/lookup`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ phone: fixtures.customer.phone });

    expect(lookup.status).toBe(200);
    expect(lookup.body.data.customerId).toBe(fixtures.customer.id);
    expect(lookup.body.data.loyalty.programEnabled).toBe(true);
    expect(lookup.body.data.loyalty.availableRewardCount).toBe(1);
    expect(lookup.body.data.loyalty.rewards[0].status).toBe('AVAILABLE');
  });

  it('stops earning while disabled and resumes after re-enable without deleting issued state', async () => {
    const first = await createInProgressAppointment('2026-07-26', '10:00');

    await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    await upsertLoyaltyProgram(fixtures.shop.id, fixtures.owner.id, {
      isEnabled: false,
      visitsRequired: 2,
      rewardPromotionId: fixtures.templatePromotion.id,
      rewardValidityDays: 30,
    });

    const disabled = await createInProgressAppointment('2026-07-27', '10:00');
    await request(app)
      .put(`/api/v1/appointments/${disabled.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    let summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.programEnabled).toBe(false);
    expect(summary.body.data.currentStampCount).toBe(1);
    expect(summary.body.data.lifetimeEligibleVisits).toBe(1);

    await upsertLoyaltyProgram(fixtures.shop.id, fixtures.owner.id, {
      isEnabled: true,
      visitsRequired: 2,
      rewardPromotionId: fixtures.templatePromotion.id,
      rewardValidityDays: 30,
    });

    const reenabled = await createInProgressAppointment('2026-07-28', '10:00');
    await request(app)
      .put(`/api/v1/appointments/${reenabled.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.programEnabled).toBe(true);
    expect(summary.body.data.currentStampCount).toBe(0);
    expect(summary.body.data.availableRewardCount).toBe(1);
  });

  it('applies a lowered threshold on the next earning event without retroactive issuance at config time', async () => {
    await upsertLoyaltyProgram(fixtures.shop.id, fixtures.owner.id, {
      isEnabled: true,
      visitsRequired: 3,
      rewardPromotionId: fixtures.templatePromotion.id,
      rewardValidityDays: 30,
    });

    const first = await createInProgressAppointment('2026-07-29', '10:00');

    await request(app)
      .put(`/api/v1/appointments/${first.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    await upsertLoyaltyProgram(fixtures.shop.id, fixtures.owner.id, {
      isEnabled: true,
      visitsRequired: 2,
      rewardPromotionId: fixtures.templatePromotion.id,
      rewardValidityDays: 30,
    });

    let summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentStampCount).toBe(1);
    expect(summary.body.data.availableRewardCount).toBe(0);

    const second = await createInProgressAppointment('2026-07-30', '10:00');
    await request(app)
      .put(`/api/v1/appointments/${second.id}/status`)
      .set(authHeader(fixtures.barber.clerkUserId))
      .send({ status: 'COMPLETED' });

    summary = await request(app)
      .get(`/api/v1/barbershops/${fixtures.shop.id}/customers/${fixtures.customer.id}/loyalty`)
      .set(authHeader(fixtures.owner.clerkUserId));
    expect(summary.status).toBe(200);
    expect(summary.body.data.currentStampCount).toBe(0);
    expect(summary.body.data.availableRewardCount).toBe(1);
  });
});
