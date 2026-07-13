import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { prisma } from '../../api/src/lib/prisma';
import { test } from './support/test';

async function openBookingPage(page: Page, slug: string) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  const response = await page.goto(`/barberias/${slug}`);
  expect(response?.ok()).toBe(true);

  return {
    consoleErrors,
    failedRequests,
  };
}

async function chooseServiceBarberDate(
  page: Page,
  fixture: {
    expectedBarberName: string;
    expectedServiceName: string;
    futureLocalDate: string;
  }
) {
  await page
    .getByRole('radio', { name: new RegExp(fixture.expectedServiceName, 'i') })
    .click();
  await page
    .getByRole('radio', { name: new RegExp(fixture.expectedBarberName, 'i') })
    .click();
  await page.getByLabel('Fecha de reserva').fill(fixture.futureLocalDate);
  await page.getByRole('button', { name: /ver horarios disponibles/i }).click();
}

async function readAvailableTimes(page: Page) {
  const buttons = page.locator('section[aria-labelledby="slot-section-title"] button');
  const count = await buttons.count();
  const times: string[] = [];

  for (let index = 0; index < count; index += 1) {
    times.push((await buttons.nth(index).innerText()).trim());
  }

  return times;
}

async function selectFirstAvailableSlot(page: Page) {
  const button = page.locator('section[aria-labelledby="slot-section-title"] button').first();
  const timeLabel = (await button.innerText()).trim();
  await button.click();
  return timeLabel;
}

async function fillCustomerForm(
  page: Page,
  overrides: Partial<{
    clientName: string;
    clientPhone: string;
    consentAccepted: boolean;
    notes: string;
  }> = {}
) {
  await page.getByLabel('Nombre y apellido').fill(
    overrides.clientName ?? 'Cliente E2E'
  );
  await page.getByLabel('Teléfono').fill(
    overrides.clientPhone ?? '+543811234567'
  );
  await page
    .getByLabel('Notas (opcional)')
    .fill(overrides.notes ?? 'Prefiere tijera');

  const checkbox = page.getByRole('checkbox');
  const shouldAccept = overrides.consentAccepted ?? true;
  if ((await checkbox.isChecked()) !== shouldAccept) {
    await checkbox.click();
  }
}

async function waitForBookingResponse(
  page: Page,
  slug: string
) {
  return page.waitForResponse((response) => {
    return (
      response.url().includes(`/api/public-booking/shops/${slug}/appointments`) &&
      response.request().method() === 'POST'
    );
  });
}

function getBookingAlert(page: Page) {
  return page.locator('p[role="alert"]');
}

async function bookThroughPublicFlow(
  page: Page,
  fixture: {
    slug: string;
    expectedBarberName: string;
    expectedServiceName: string;
    futureLocalDate: string;
  },
  overrides?: Partial<{
    clientName: string;
    clientPhone: string;
    notes: string;
  }>
) {
  await chooseServiceBarberDate(page, fixture);
  const chosenTime = await selectFirstAvailableSlot(page);
  await fillCustomerForm(page, overrides);

  const responsePromise = waitForBookingResponse(page, fixture.slug);
  await page.getByRole('button', { name: /reservar turno/i }).click();
  const response = await responsePromise;
  await page.waitForURL(new RegExp(`/barberias/${fixture.slug}/confirmacion$`));

  return {
    chosenTime,
    response,
  };
}

async function loadConsentVersion(request: APIRequestContext, slug: string) {
  const response = await request.get(
    `http://127.0.0.1:3000/api/v1/public/barbershops/${slug}/booking-config`
  );
  const payload = (await response.json()) as {
    success: boolean;
    data: {
      consent: {
        version: string;
      };
    };
  };

  return payload.data.consent.version;
}

test('scenario 1 — direct public page load', async ({
  bookingFixture,
  page,
}) => {
  const telemetry = await openBookingPage(page, bookingFixture.slug);

  await expect(
    page.getByRole('heading', { name: bookingFixture.shopName })
  ).toBeVisible();
  await expect(
    page.getByText('1. Elegí un servicio', { exact: false })
  ).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(bookingFixture.serviceId);
  expect(bodyText).not.toContain(bookingFixture.barberId);
  expect(bodyText).not.toContain(bookingFixture.ownerClerkUserId);
  expect(telemetry.consoleErrors).toEqual([]);
  expect(telemetry.failedRequests).toEqual([]);
});

test('scenario 2 — complete successful booking', async ({
  bookingFixture,
  page,
  request,
}) => {
  await openBookingPage(page, bookingFixture.slug);

  const { chosenTime, response } = await bookThroughPublicFlow(page, bookingFixture, {
    clientName: 'Cliente Confirmado',
    clientPhone: '+543811234567',
    notes: 'Prefiere tijera',
  });

  expect(response.status()).toBe(201);

  const bookingReference = await page.getByText(/^pb_/i).innerText();

  await expect(page.getByText(bookingReference)).toBeVisible();
  await expect(page.getByText(bookingFixture.shopName)).toBeVisible();
  await expect(
    page.getByText(bookingFixture.expectedServiceName, { exact: false })
  ).toBeVisible();
  await expect(
    page.getByText(bookingFixture.expectedBarberName, { exact: false })
  ).toBeVisible();
  await expect(page.getByText(chosenTime, { exact: false })).toBeVisible();
  await expect(page.getByText('+543811234567')).toBeVisible();
  await expect(page.getByText('CONFIRMED')).toBeVisible();

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: {
      publicReference: bookingReference,
    },
    select: {
      id: true,
      clientId: true,
      status: true,
      publicReference: true,
      publicConsentAcceptedAt: true,
      publicConsentVersion: true,
      clientPhone: true,
      clientName: true,
      serviceName: true,
      serviceDurationMinutes: true,
      servicePriceCents: true,
      serviceCurrency: true,
      notes: true,
    },
  });

  expect(appointment.clientId).toBeNull();
  expect(appointment.status).toBe('CONFIRMED');
  expect(appointment.publicReference).toBe(bookingReference);
  expect(appointment.publicConsentAcceptedAt).not.toBeNull();
  expect(appointment.publicConsentVersion).toBeTruthy();
  expect(appointment.clientPhone).toBe('+543811234567');
  expect(appointment.clientName).toBe('Cliente Confirmado');
  expect(appointment.serviceName).toBe(bookingFixture.expectedServiceName);
  expect(appointment.serviceDurationMinutes).toBe(30);
  expect(appointment.servicePriceCents).toBe(3200);
  expect(appointment.serviceCurrency).toBe('ARS');
  expect(appointment.notes).toBe('Prefiere tijera');

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain(appointment.id);

  const staffListResponse = await request.get('http://127.0.0.1:3000/api/v1/appointments', {
    headers: {
      'x-test-user-id': bookingFixture.ownerClerkUserId,
    },
  });
  expect(staffListResponse.status()).toBe(200);

  const staffAppointments = (await staffListResponse.json()) as {
    success: boolean;
    data: Array<{ publicReference?: string }>;
  };

  expect(staffAppointments.success).toBe(true);
  expect(
    staffAppointments.data.some(
      (appointmentItem) => appointmentItem.publicReference === bookingReference
    )
  ).toBe(true);
});

test('scenario 3 — double-click prevention', async ({
  bookingFixture,
  page,
}) => {
  await openBookingPage(page, bookingFixture.slug);
  await chooseServiceBarberDate(page, bookingFixture);
  await selectFirstAvailableSlot(page);
  await fillCustomerForm(page, {
    clientName: 'Cliente Doble',
    clientPhone: '+543811234568',
    notes: 'Doble click',
  });

  let bookingPostCount = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes(`/api/public-booking/shops/${bookingFixture.slug}/appointments`)
    ) {
      bookingPostCount += 1;
    }
  });

  const responsePromise = waitForBookingResponse(page, bookingFixture.slug);
  await page.getByRole('button', { name: /reservar turno/i }).dblclick();
  const response = await responsePromise;

  expect(response.status()).toBe(201);
  expect(bookingPostCount).toBe(1);
  await expect(page.getByText('¡Reserva confirmada!')).toBeVisible();
  await expect(
    page.getByText(/ya no está disponible/i)
  ).not.toBeVisible();

  const appointments = await prisma.appointment.findMany({
    where: {
      clientName: 'Cliente Doble',
    },
    select: {
      id: true,
    },
  });

  expect(appointments).toHaveLength(1);
});

test('scenario 4 — ambiguous network retry and idempotency', async ({
  bookingFixture,
  page,
}) => {
  await openBookingPage(page, bookingFixture.slug);
  await chooseServiceBarberDate(page, bookingFixture);
  await selectFirstAvailableSlot(page);
  await fillCustomerForm(page, {
    clientName: 'Cliente Reintento',
    clientPhone: '+543811234569',
    notes: 'Reintento ambiguo',
  });

  let interceptedRequests = 0;
  let firstIdempotencyKey = '';
  let replayIdempotencyKey = '';

  await page.route(
    `**/api/public-booking/shops/${bookingFixture.slug}/appointments`,
    async (route) => {
      interceptedRequests += 1;
      const requestHeaders = route.request().headers();

      if (interceptedRequests === 1) {
        firstIdempotencyKey = requestHeaders['idempotency-key'] ?? '';
        await route.fetch();
        await route.abort('failed');
        return;
      }

      replayIdempotencyKey = requestHeaders['idempotency-key'] ?? '';
      await route.continue();
    }
  );

  await page.getByRole('button', { name: /reservar turno/i }).click();

  await expect(
    getBookingAlert(page)
  ).toHaveText(/no pudimos confirmar si la reserva se completó/i);

  const pendingAttempt = await page.evaluate((slug) => {
    return window.sessionStorage.getItem(`public-booking-pending-attempt:${slug}`);
  }, bookingFixture.slug);

  expect(pendingAttempt).toContain(firstIdempotencyKey);

  const afterFirstAttempt = await prisma.appointment.findMany({
    where: {
      clientName: 'Cliente Reintento',
    },
    select: {
      id: true,
      publicReference: true,
    },
  });

  expect(afterFirstAttempt).toHaveLength(1);

  const replayResponsePromise = waitForBookingResponse(page, bookingFixture.slug);
  await page.getByRole('button', { name: /reservar turno/i }).click();
  const replayResponse = await replayResponsePromise;

  expect(replayResponse.status()).toBe(200);
  expect(replayIdempotencyKey).toBe(firstIdempotencyKey);

  const finalAppointments = await prisma.appointment.findMany({
    where: {
      clientName: 'Cliente Reintento',
    },
    select: {
      id: true,
    },
  });

  expect(finalAppointments).toHaveLength(1);
  await expect(page.getByText('¡Reserva confirmada!')).toBeVisible();
});

test('scenario 5 — stale-slot conflict recovery', async ({
  bookingFixture,
  page,
  request,
}) => {
  await openBookingPage(page, bookingFixture.slug);
  await chooseServiceBarberDate(page, bookingFixture);
  const chosenTime = await selectFirstAvailableSlot(page);
  await fillCustomerForm(page, {
    clientName: 'Cliente Conflicto',
    clientPhone: '+543811234570',
    notes: 'Conflicto controlado',
  });

  const availabilityResponse = await request.get(
    `http://127.0.0.1:3000/api/v1/public/barbershops/${bookingFixture.slug}/barbers/${bookingFixture.barberId}/availability`,
    {
      params: {
        serviceId: bookingFixture.serviceId,
        localDate: bookingFixture.futureLocalDate,
      },
    }
  );
  const availabilityPayload = (await availabilityResponse.json()) as {
    success: boolean;
    data: {
      slots: Array<{ startAt: string }>;
    };
  };
  const conflictingStartAt = availabilityPayload.data.slots[0]!.startAt;
  const consentVersion = await loadConsentVersion(request, bookingFixture.slug);

  const competingResponse = await request.post(
    `http://127.0.0.1:3000/api/v1/public/barbershops/${bookingFixture.slug}/appointments`,
    {
      headers: {
        'Idempotency-Key': 'stale-slot-competing-booking',
      },
      data: {
        serviceId: bookingFixture.serviceId,
        barberId: bookingFixture.barberId,
        startAt: conflictingStartAt,
        clientName: 'Competidor',
        clientPhone: '+543811234571',
        notes: 'Reserva competidora',
        consentAccepted: true,
        consentVersion,
      },
    }
  );
  expect(competingResponse.status()).toBe(201);

  const staleResponsePromise = waitForBookingResponse(page, bookingFixture.slug);
  await page.getByRole('button', { name: /reservar turno/i }).click();
  const staleResponse = await staleResponsePromise;

  expect(staleResponse.status()).toBe(409);
  await expect(getBookingAlert(page)).toHaveText(/ya no está disponible/i);
  await expect(page.getByText(/turno seleccionado/i)).not.toBeVisible();
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue(
    'Cliente Conflicto'
  );
  await expect(page.getByLabel('Teléfono')).toHaveValue('+543811234570');
  await expect(page.getByLabel('Notas (opcional)')).toHaveValue(
    'Conflicto controlado'
  );

  const remainingTimes = await readAvailableTimes(page);
  expect(remainingTimes).not.toContain(chosenTime);
  expect(remainingTimes.length).toBeGreaterThan(0);

  await page
    .locator('section[aria-labelledby="slot-section-title"] button')
    .first()
    .click();
  const recoveryResponsePromise = waitForBookingResponse(page, bookingFixture.slug);
  await page.getByRole('button', { name: /reservar turno/i }).click();
  const recoveryResponse = await recoveryResponsePromise;

  expect(recoveryResponse.status()).toBe(201);

  const bookedAppointments = await prisma.appointment.findMany({
    where: {
      OR: [{ clientName: 'Cliente Conflicto' }, { clientName: 'Competidor' }],
    },
    select: {
      clientName: true,
    },
  });

  expect(bookedAppointments.map((appointment) => appointment.clientName).sort()).toEqual([
    'Cliente Conflicto',
    'Competidor',
  ]);
});

test('scenario 6 — confirmation refresh behavior', async ({
  bookingFixture,
  page,
  browser,
}) => {
  await openBookingPage(page, bookingFixture.slug);
  await bookThroughPublicFlow(page, bookingFixture, {
    clientName: 'Cliente Confirmación',
    clientPhone: '+543811234572',
    notes: 'Confirma refresh',
  });

  const bookingReference = await page.getByText(/^pb_/i).innerText();

  await page.reload();
  await expect(page.getByText(bookingReference)).toBeVisible();

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  const freshRequests: string[] = [];

  freshPage.on('request', (request) => {
    freshRequests.push(request.url());
  });

  await freshPage.goto(
    `http://127.0.0.1:3001/barberias/${bookingFixture.slug}/confirmacion`
  );
  await expect(
    freshPage.getByText(/no encontramos la confirmación en este navegador/i)
  ).toBeVisible();

  expect(freshRequests.every((url) => !url.includes(bookingReference))).toBe(true);
  expect(
    freshRequests.every(
      (url) =>
        !url.includes('/lookup') &&
        !url.includes('/api/public-booking/shops/') &&
        !url.includes('/appointments?reference=')
    )
  ).toBe(true);

  await freshContext.close();
});

test('scenario 7 — validation and accessibility smoke', async ({
  bookingFixture,
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openBookingPage(page, bookingFixture.slug);
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    })
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await chooseServiceBarberDate(page, bookingFixture);
  await selectFirstAvailableSlot(page);

  await page.getByRole('button', { name: /reservar turno/i }).click();
  await expect(getBookingAlert(page)).toHaveText(
    /ingresá tu nombre y apellido/i
  );
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe(
    'alert'
  );

  await fillCustomerForm(page, {
    clientName: 'Cliente Validación',
    clientPhone: '3811234',
    consentAccepted: false,
    notes: 'Smoke a11y',
  });

  await page.getByRole('button', { name: /reservar turno/i }).click();
  await expect(getBookingAlert(page)).toHaveText(
    /formato internacional/i
  );

  await fillCustomerForm(page, {
    clientName: 'Cliente Validación',
    clientPhone: '+543811234573',
    consentAccepted: false,
    notes: 'Smoke a11y',
  });

  await page.getByRole('button', { name: /reservar turno/i }).click();
  await expect(getBookingAlert(page)).toHaveText(
    /aceptar el consentimiento/i
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /reservar turno/i }).focus();
  const responsePromise = waitForBookingResponse(page, bookingFixture.slug);
  await page.keyboard.press('Enter');
  const response = await responsePromise;

  expect(response.status()).toBe(201);
  await expect(page.getByText('¡Reserva confirmada!')).toBeVisible();
});

test('scenario 8 — public route and protected-route isolation', async ({
  bookingFixture,
  page,
  request,
}) => {
  await openBookingPage(page, bookingFixture.slug);

  const barberResponsePromise = page.waitForResponse((response) => {
    return response.url().includes(
      `/api/public-booking/shops/${bookingFixture.slug}/barbers?`
    );
  });

  await page
    .getByRole('radio', { name: new RegExp(bookingFixture.expectedServiceName, 'i') })
    .click();

  const barberResponse = await barberResponsePromise;
  expect(barberResponse.status()).toBe(200);
  const barberPayload = (await barberResponse.json()) as {
    success: boolean;
    data: Array<Record<string, unknown>>;
  };

  expect(barberPayload.success).toBe(true);
  expect(Object.keys(barberPayload.data[0] ?? {}).sort()).toEqual([
    'barberId',
    'displayName',
  ]);

  const protectedResponse = await request.get(
    'http://127.0.0.1:3000/api/v1/me/context'
  );
  expect(protectedResponse.status()).toBe(401);

  await chooseServiceBarberDate(page, bookingFixture);
  const availabilityResponse = await request.get(
    `http://127.0.0.1:3000/api/v1/public/barbershops/${bookingFixture.slug}/barbers/${bookingFixture.barberId}/availability`,
    {
      params: {
        serviceId: bookingFixture.serviceId,
        localDate: bookingFixture.futureLocalDate,
      },
    }
  );
  const availabilityPayload = (await availabilityResponse.json()) as {
    data: {
      slots: Array<{ startAt: string }>;
    };
  };
  const startAt = availabilityPayload.data.slots[0]!.startAt;
  const consentVersion = await loadConsentVersion(request, bookingFixture.slug);

  const injectedResponse = await page.evaluate(
    async ({ slug, serviceId, barberId, startAt, consentVersion }) => {
      const response = await fetch(
        `/api/public-booking/shops/${slug}/appointments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'injected-tenant-attempt',
          },
          body: JSON.stringify({
            serviceId,
            barberId,
            startAt,
            clientName: 'Cliente Aislado',
            clientPhone: '+543811234574',
            notes: 'Intento con tenant inyectado',
            consentAccepted: true,
            consentVersion,
            barbershopId: 'evil-tenant',
          }),
        }
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      slug: bookingFixture.slug,
      serviceId: bookingFixture.serviceId,
      barberId: bookingFixture.barberId,
      startAt,
      consentVersion,
    }
  );

  expect(injectedResponse.status).toBe(400);
  expect(injectedResponse.body.success).toBe(false);
  expect(injectedResponse.body.error.code).toBe('VALIDATION_ERROR');
});
