import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createAppFromEnv } from '../../src/app.js';
import { encryptPaymentSecret } from '../../src/lib/payments/crypto.js';
import { readPaymentRuntimeConfig, requirePaymentsEnabled } from '../../src/lib/payments/runtime.js';
import { prisma } from '../../src/lib/prisma.js';
import { CURRENT_PUBLIC_BOOKING_CONSENT_VERSION } from '../../src/lib/publicBookingConsent.js';
import { localDateTimeToUtc } from '../../src/lib/dateUtils.js';
import {
  processPendingPaymentWebhookEvents,
  reconcileAuthoritativePayment,
} from '../../src/services/payments/bookingPaymentService.js';
import {
  setMercadoPagoTransportForTests,
  type MercadoPagoPaymentDetails,
} from '../../src/services/payments/providers/mercadoPagoClient.js';
import { setupDefaultWorkingHours } from '../../src/services/barbershopService.js';
import { getNextLocalWeekdayDate, TEST_BARBERSHOP_TIMEZONE } from '../helpers/timezone.js';

const app = createAppFromEnv();
const runtime = requirePaymentsEnabled(readPaymentRuntimeConfig(process.env));

interface Fixtures {
  owner: { id: string; clerkUserId: string };
  barber: { employeeId: string };
  shop: { id: string; slug: string };
  service: { id: string; durationMinutes: number; priceCents: number };
}

const fixtures = {} as Fixtures;
let latestPreferenceBody: Record<string, unknown> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeader(clerkUserId: string) {
  return { 'x-test-user-id': clerkUserId };
}

function nextStartAtIso() {
  const localDate = getNextLocalWeekdayDate(1, new Date(), TEST_BARBERSHOP_TIMEZONE);
  return localDateTimeToUtc(localDate, '10:00', TEST_BARBERSHOP_TIMEZONE).toISOString();
}

function publicBookingPayload() {
  return {
    serviceId: fixtures.service.id,
    barberId: fixtures.barber.employeeId,
    startAt: nextStartAtIso(),
    clientName: 'Pago Cliente',
    clientPhone: '+543811234567',
    clientEmail: 'pago-cliente@example.com',
    consentAccepted: true,
    consentVersion: CURRENT_PUBLIC_BOOKING_CONSENT_VERSION,
  };
}

function buildWebhookSignature(input: {
  dataId: string;
  requestId: string;
  ts: string;
}) {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
  const v1 = crypto
    .createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET!)
    .update(manifest)
    .digest('hex');
  return `ts=${input.ts},v1=${v1}`;
}

async function clearPaymentDomainTables() {
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.bookingPaymentReviewAction.deleteMany();
  await prisma.bookingPaymentReview.deleteMany();
  await prisma.bookingPayment.deleteMany();
  await prisma.paymentOAuthState.deleteMany();
  await prisma.barbershopPaymentConnection.deleteMany();
  await prisma.barbershopDepositPolicy.deleteMany();
  await prisma.publicBookingIdempotency.deleteMany();
  await prisma.appointmentNotification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.customer.deleteMany();
}

async function configureConnectedDeposits() {
  await prisma.barbershopPaymentConnection.upsert({
    where: {
      barbershopId_provider: {
        barbershopId: fixtures.shop.id,
        provider: 'MERCADO_PAGO',
      },
    },
    create: {
      barbershopId: fixtures.shop.id,
      provider: 'MERCADO_PAGO',
      status: 'CONNECTED',
      providerSellerId: 'seller-123',
      providerPublicKey: 'public-key-123',
      accessTokenCiphertext: encryptPaymentSecret('seller-access-token', runtime.encryptionKey),
      refreshTokenCiphertext: encryptPaymentSecret('seller-refresh-token', runtime.encryptionKey),
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      connectedAt: new Date(),
      lastRefreshedAt: new Date(),
    },
    update: {
      status: 'CONNECTED',
      providerSellerId: 'seller-123',
      providerPublicKey: 'public-key-123',
      accessTokenCiphertext: encryptPaymentSecret('seller-access-token', runtime.encryptionKey),
      refreshTokenCiphertext: encryptPaymentSecret('seller-refresh-token', runtime.encryptionKey),
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      revokedAt: null,
      lastErrorCode: null,
    },
  });

  await prisma.barbershopDepositPolicy.upsert({
    where: { barbershopId: fixtures.shop.id },
    create: {
      barbershopId: fixtures.shop.id,
      mode: 'FIXED',
      fixedAmountCents: 1500,
      holdDurationMinutes: 15,
      currency: 'ARS',
      publicTerms: 'La reserva se confirma con la seña.',
    },
    update: {
      mode: 'FIXED',
      fixedAmountCents: 1500,
      percentageBasisPoints: null,
      holdDurationMinutes: 15,
      currency: 'ARS',
      publicTerms: 'La reserva se confirma con la seña.',
    },
  });
}

async function createDepositBooking() {
  const response = await request(app)
    .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
    .set('Idempotency-Key', `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`)
    .send(publicBookingPayload());

  expect(response.status).toBe(201);

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { publicReference: response.body.data.bookingReference },
  });
  const payment = await prisma.bookingPayment.findFirstOrThrow({
    where: { appointmentId: appointment.id },
    orderBy: { createdAt: 'desc' },
  });

  return { response, appointment, payment };
}

describe('Mercado Pago deposit reservation flow', () => {
  beforeAll(async () => {
    await clearPaymentDomainTables();
    await prisma.employeeService.deleteMany();
    await prisma.workingHours.deleteMany();
    await prisma.service.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.barbershop.deleteMany();
    await prisma.user.deleteMany();

    const owner = await prisma.user.create({
      data: {
        clerkUserId: 'payments_owner',
        email: 'payments-owner@test.com',
        name: 'Payments Owner',
        role: 'OWNER',
      },
    });
    const barberUser = await prisma.user.create({
      data: {
        clerkUserId: 'payments_barber',
        email: 'payments-barber@test.com',
        name: 'Payments Barber',
        role: 'BARBER',
      },
    });
    const shop = await prisma.barbershop.create({
      data: {
        ownerId: owner.id,
        name: 'Payments Shop',
        timezone: TEST_BARBERSHOP_TIMEZONE,
        publicSlug: 'payments-shop',
        isActive: true,
      },
    });
    await setupDefaultWorkingHours(shop.id);

    const employee = await prisma.employee.create({
      data: {
        barbershopId: shop.id,
        userId: barberUser.id,
        isActive: true,
      },
    });
    const service = await prisma.service.create({
      data: {
        barbershopId: shop.id,
        name: 'Classic Cut',
        durationMinutes: 30,
        priceCents: 4000,
        currency: 'ARS',
        isActive: true,
      },
    });
    await prisma.employeeService.create({
      data: { employeeId: employee.id, serviceId: service.id },
    });

    fixtures.owner = { id: owner.id, clerkUserId: owner.clerkUserId };
    fixtures.barber = { employeeId: employee.id };
    fixtures.shop = { id: shop.id, slug: 'payments-shop' };
    fixtures.service = {
      id: service.id,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
    };
  });

  beforeEach(async () => {
    await clearPaymentDomainTables();
    await configureConnectedDeposits();
    latestPreferenceBody = null;
    setMercadoPagoTransportForTests({
      async fetch(input, init) {
        const url = String(input);

        if (url.endsWith('/checkout/preferences')) {
          latestPreferenceBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              id: 'pref_test_123',
              init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref_test_123',
              expiration_date_to: new Date(Date.now() + 15 * 60_000).toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (url.includes('/v1/payments/')) {
          const paymentId = url.split('/v1/payments/')[1] ?? 'provider-payment-1';
          return new Response(
            JSON.stringify({
              id: paymentId,
              status: 'approved',
              status_detail: 'accredited',
              currency_id: 'ARS',
              transaction_amount: 15,
              external_reference: JSON.parse(String(init?.body ?? 'null'))?.external_reference ?? null,
              collector_id: 'seller-123',
              date_approved: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        throw new Error(`Unexpected Mercado Pago test request: ${url}`);
      },
    });
  });

  afterEach(() => {
    setMercadoPagoTransportForTests(null);
  });

  afterAll(async () => {
    setMercadoPagoTransportForTests(null);
    await clearPaymentDomainTables();
    await prisma.employeeService.deleteMany();
    await prisma.workingHours.deleteMany();
    await prisma.service.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.barbershop.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('creates a pending appointment hold with a pending booking payment and no confirmation notifications yet', async () => {
    const { response, appointment, payment } = await createDepositBooking();

    expect(response.body.data.appointmentStatus).toBe('PENDING');
    expect(response.body.data.paymentStatus).toBe('PENDING');
    expect(response.body.data.amountCents).toBe(1500);
    expect(response.body.data.checkoutUrl).toContain('mercadopago.com');

    expect(appointment.status).toBe('PENDING');
    expect(appointment.paymentHoldExpiresAt).toBeInstanceOf(Date);
    expect(payment.status).toBe('PENDING');
    expect(payment.amountCents).toBe(1500);
    expect(payment.currency).toBe('ARS');
    expect(String(latestPreferenceBody?.notification_url ?? '')).toContain('/api/v1/webhooks/mercado-pago');
    expect(String(latestPreferenceBody?.notification_url ?? '')).not.toContain('/api/payment-webhooks/mercado-pago');
    expect((latestPreferenceBody?.metadata as Record<string, unknown>)?.booking_payment_id).toBe(payment.id);

    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(notifications).toHaveLength(0);
  });

  it('bypasses a configured deposit without contacting the provider when payments are globally disabled', async () => {
    const disabledApp = createAppFromEnv({
      ...process.env,
      PAYMENTS_ENABLED: 'false',
    });

    const response = await request(disabledApp)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments`)
      .set('Idempotency-Key', `disabled_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`)
      .send(publicBookingPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.appointmentStatus).toBe('CONFIRMED');
    expect(response.body.data.paymentStatus).toBe('NOT_REQUIRED');
    expect(response.body.data.amountCents).toBeNull();
    expect(latestPreferenceBody).toBeNull();

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { publicReference: response.body.data.bookingReference },
    });
    expect(appointment.status).toBe('CONFIRMED');
    expect(appointment.paymentHoldExpiresAt).toBeNull();
    expect(await prisma.bookingPayment.count({ where: { appointmentId: appointment.id } })).toBe(0);
    expect(await prisma.appointmentNotification.count({ where: { appointmentId: appointment.id } })).toBeGreaterThan(0);
  });

  it('serves concurrent public payment previews without creating policy state when payments are disabled', async () => {
    await prisma.barbershopDepositPolicy.delete({
      where: { barbershopId: fixtures.shop.id },
    });
    const disabledApp = createAppFromEnv({
      ...process.env,
      PAYMENTS_ENABLED: 'false',
    });

    const [services, bookingConfig] = await Promise.all([
      request(disabledApp).get(`/api/v1/public/barbershops/${fixtures.shop.slug}/services`),
      request(disabledApp).get(`/api/v1/public/barbershops/${fixtures.shop.slug}/booking-config`),
    ]);

    expect(services.status).toBe(200);
    expect(services.body.data[0].depositRequired).toBe(false);
    expect(bookingConfig.status).toBe(200);
    expect(bookingConfig.body.data.depositPolicy.enabled).toBe(false);
    expect(await prisma.barbershopDepositPolicy.count({
      where: { barbershopId: fixtures.shop.id },
    })).toBe(0);
    expect(latestPreferenceBody).toBeNull();
  });

  it('rejects manual owner confirmation while the deposit is still unpaid', async () => {
    const { appointment } = await createDepositBooking();

    const response = await request(app)
      .put(`/api/v1/appointments/${appointment.id}/status`)
      .set(authHeader(fixtures.owner.clerkUserId))
      .send({ status: 'CONFIRMED' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_APPROVAL_REQUIRED');
  });

  it('accepts a signed webhook, processes the authoritative approval, and confirms the appointment exactly once', async () => {
    let paymentDetails: MercadoPagoPaymentDetails | null = null;
    const { appointment, payment } = await createDepositBooking();

    setMercadoPagoTransportForTests({
      async fetch(input) {
        const url = String(input);

        if (url.endsWith('/checkout/preferences')) {
          return new Response(
            JSON.stringify({
              id: 'pref_test_123',
              init_point: 'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref_test_123',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (url.includes('/v1/payments/')) {
          return new Response(
            JSON.stringify({
              id: paymentDetails?.id ?? 'provider-payment-1',
              status: paymentDetails?.status ?? 'approved',
              status_detail: paymentDetails?.statusDetail ?? 'accredited',
              currency_id: paymentDetails?.currencyId ?? 'ARS',
              transaction_amount: paymentDetails?.transactionAmount ?? 15,
              external_reference: payment.externalReference,
              collector_id: 'seller-123',
              date_approved: paymentDetails?.dateApproved ?? new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        throw new Error(`Unexpected Mercado Pago test request: ${url}`);
      },
    });

    paymentDetails = {
      id: 'provider-payment-1',
      status: 'approved',
      statusDetail: 'accredited',
      currencyId: 'ARS',
      transactionAmount: 15,
      externalReference: payment.externalReference,
      collectorId: 'seller-123',
      dateApproved: new Date().toISOString(),
      bookingPaymentId: payment.id,
    };

    const webhookResponse = await request(app)
      .post(
        `/api/v1/webhooks/mercado-pago?data.id=${encodeURIComponent(paymentDetails.id)}&external_reference=${encodeURIComponent(payment.externalReference)}&type=payment`
      )
      .set(
        'x-signature',
        buildWebhookSignature({
          dataId: paymentDetails.id,
          requestId: 'req-webhook-1',
          ts: '1721170000',
        })
      )
      .set('x-request-id', 'req-webhook-1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ action: 'payment.updated' }));

    expect(webhookResponse.status).toBe(200);

    let persistedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    let persistedPayment = await prisma.bookingPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    let webhookEvents = await prisma.paymentWebhookEvent.findMany({
      where: { externalReference: payment.externalReference },
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (
        persistedAppointment.status === 'CONFIRMED'
        && persistedPayment.status === 'APPROVED'
        && webhookEvents.some((event) => event.status === 'PROCESSED')
      ) {
        break;
      }

      if (webhookEvents.some((event) => event.status === 'RECEIVED' || event.status === 'ERROR')) {
        await processPendingPaymentWebhookEvents();
      }

      await sleep(25);

      persistedAppointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      });
      persistedPayment = await prisma.bookingPayment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      webhookEvents = await prisma.paymentWebhookEvent.findMany({
        where: { externalReference: payment.externalReference },
      });
    }

    const notifications = await prisma.appointmentNotification.findMany({
      where: { appointmentId: appointment.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(persistedAppointment.status).toBe('CONFIRMED');
    expect(persistedAppointment.paymentHoldExpiresAt).toBeNull();
    expect(persistedAppointment.paymentConfirmedAt).toBeInstanceOf(Date);
    expect(persistedPayment.status).toBe('APPROVED');
    expect(persistedPayment.providerPaymentId).toBe(paymentDetails.id);
    expect(notifications.filter((item) => item.type === 'BOOKING_CONFIRMATION')).toHaveLength(1);
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0]?.status).toBe('PROCESSED');
  });

  it('marks late approvals as review required and cancels the stale appointment hold', async () => {
    const { appointment, payment } = await createDepositBooking();
    const now = new Date();

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        paymentHoldExpiresAt: new Date(now.getTime() - 60_000),
      },
    });
    await prisma.bookingPayment.update({
      where: { id: payment.id },
      data: {
        expiresAt: new Date(now.getTime() - 60_000),
      },
    });

    await reconcileAuthoritativePayment({
      bookingPaymentId: payment.id,
      providerPayment: {
        id: 'provider-late-1',
        status: 'approved',
        statusDetail: 'accredited',
        currencyId: 'ARS',
        transactionAmount: 15,
        externalReference: payment.externalReference,
        collectorId: 'seller-123',
        dateApproved: now.toISOString(),
        bookingPaymentId: payment.id,
      },
      sellerId: 'seller-123',
      now,
    });

    const persistedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    const persistedPayment = await prisma.bookingPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const reviews = await prisma.bookingPaymentReview.findMany({
      where: { bookingPaymentId: payment.id },
    });

    expect(persistedAppointment.status).toBe('CANCELLED');
    expect(persistedAppointment.paymentHoldExpiresAt).toBeNull();
    expect(persistedPayment.status).toBe('APPROVED');
    expect(persistedPayment.reviewReasonCode).toBe('APPROVED_AFTER_HOLD_EXPIRY');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reason).toBe('APPROVED_AFTER_HOLD_EXPIRY');
    expect(reviews[0]?.status).toBe('OPEN');
  });

  it('public cancellation of an approved deposit keeps the payment for review instead of refunding automatically', async () => {
    const { appointment, payment } = await createDepositBooking();
    const now = new Date();

    await reconcileAuthoritativePayment({
      bookingPaymentId: payment.id,
      providerPayment: {
        id: 'provider-approved-2',
        status: 'approved',
        statusDetail: 'accredited',
        currencyId: 'ARS',
        transactionAmount: 15,
        externalReference: payment.externalReference,
        collectorId: 'seller-123',
        dateApproved: now.toISOString(),
        bookingPaymentId: payment.id,
      },
      sellerId: 'seller-123',
      now,
    });

    const confirmedAppointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(confirmedAppointment.status).toBe('CONFIRMED');

    const cancelResponse = await request(app)
      .post(`/api/v1/public/barbershops/${fixtures.shop.slug}/appointments/${confirmedAppointment.publicReference}/cancel`)
      .send({ reason: 'No puedo asistir' });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.refundReviewRequired).toBe(true);
    expect(cancelResponse.body.data.paymentStatus).toBe('REVIEW_REQUIRED');

    const persistedPayment = await prisma.bookingPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const reviews = await prisma.bookingPaymentReview.findMany({
      where: { bookingPaymentId: payment.id },
    });
    expect(persistedPayment.status).toBe('APPROVED');
    expect(persistedPayment.reviewReasonCode).toBe('APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.reason).toBe('APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT');
  });
});
