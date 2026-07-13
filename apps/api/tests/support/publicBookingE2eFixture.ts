import { createHash } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
const TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/barberapp_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL_TEST = TEST_DATABASE_URL;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'sk_test_mock';
process.env.CLERK_WEBHOOK_SECRET =
  process.env.CLERK_WEBHOOK_SECRET ?? 'whsec_test_mock';
Object.assign(process.env, {
  NODE_ENV: 'test',
});
import {
  addDaysToDateString,
  getLocalDateStringInTimeZone,
} from '../../src/lib/dateUtils.js';

const E2E_TIMEZONE = 'America/Argentina/Tucuman';
const E2E_SLUG_PREFIX = 'e2e-public-booking';
const prisma = new PrismaClient();
const DEFAULT_WORKING_HOURS = [
  { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00' },
  { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00' },
  { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00' },
  { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00' },
  { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00' },
  { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00' },
] as const;

async function setupDefaultWorkingHoursForFixture(barbershopId: string) {
  await prisma.workingHours.createMany({
    data: DEFAULT_WORKING_HOURS.map((day) => ({
      barbershopId,
      dayOfWeek: day.dayOfWeek,
      openTime: day.openTime,
      closeTime: day.closeTime,
    })),
    skipDuplicates: true,
  });
}

async function setScheduleExceptionIntervals(input: {
  barbershopId: string;
  localDate: string;
  intervals: Array<{ openTime: string; closeTime: string }>;
}) {
  const scheduleException = await prisma.barbershopScheduleException.upsert({
    where: {
      barbershopId_localDate: {
        barbershopId: input.barbershopId,
        localDate: input.localDate,
      },
    },
    create: {
      barbershopId: input.barbershopId,
      localDate: input.localDate,
      isClosed: false,
    },
    update: {
      isClosed: false,
    },
    select: {
      id: true,
    },
  });

  await prisma.barbershopScheduleExceptionInterval.deleteMany({
    where: {
      scheduleExceptionId: scheduleException.id,
    },
  });

  await prisma.barbershopScheduleExceptionInterval.createMany({
    data: input.intervals.map((interval, index) => ({
      scheduleExceptionId: scheduleException.id,
      openTime: interval.openTime,
      closeTime: interval.closeTime,
      position: index,
    })),
  });
}

interface FixtureIds {
  barberClerkUserId: string;
  barberDisplayName: string;
  foreignBarberClerkUserId: string;
  foreignSlug: string;
  foreignShopName: string;
  foreignServiceName: string;
  ownerClerkUserId: string;
  ownerName: string;
  serviceName: string;
  shopName: string;
  slug: string;
  suffix: string;
}

export interface PublicBookingE2eFixture {
  barberId: string;
  expectedBarberName: string;
  expectedServiceName: string;
  foreignBarberId: string;
  foreignServiceId: string;
  futureLocalDate: string;
  ownerClerkUserId: string;
  serviceId: string;
  shopName: string;
  slug: string;
}

function hashKey(key: string) {
  return createHash('sha1').update(key).digest('hex').slice(0, 10);
}

function buildFixtureIds(key: string): FixtureIds {
  const suffix = hashKey(key);

  return {
    suffix,
    slug: `${E2E_SLUG_PREFIX}-${suffix}`,
    foreignSlug: `${E2E_SLUG_PREFIX}-foreign-${suffix}`,
    shopName: `E2E Booking Shop ${suffix.toUpperCase()}`,
    foreignShopName: `E2E Foreign Shop ${suffix.toUpperCase()}`,
    ownerName: `E2E Owner ${suffix.toUpperCase()}`,
    ownerClerkUserId: `e2e_owner_${suffix}`,
    barberClerkUserId: `e2e_barber_${suffix}`,
    foreignBarberClerkUserId: `e2e_foreign_barber_${suffix}`,
    barberDisplayName: `Barbero E2E ${suffix.toUpperCase()}`,
    serviceName: `Servicio E2E ${suffix.toUpperCase()}`,
    foreignServiceName: `Servicio Externo ${suffix.toUpperCase()}`,
  };
}

export function deriveFutureFixtureLocalDate(now: Date = new Date()) {
  const localToday = getLocalDateStringInTimeZone(E2E_TIMEZONE, now);
  return addDaysToDateString(localToday, 2);
}

async function cleanupBarbershopsByIds(barbershopIds: string[]) {
  if (barbershopIds.length === 0) {
    return;
  }

  const employees = await prisma.employee.findMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
    select: {
      id: true,
      userId: true,
    },
  });

  const employeeIds = employees.map((employee) => employee.id);

  await prisma.publicBookingIdempotency.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.appointment.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  if (employeeIds.length > 0) {
    await prisma.employeeService.deleteMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
      },
    });
  }

  const scheduleExceptions = await prisma.barbershopScheduleException.findMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
    select: {
      id: true,
    },
  });

  const scheduleExceptionIds = scheduleExceptions.map((exception) => exception.id);

  if (scheduleExceptionIds.length > 0) {
    await prisma.barbershopScheduleExceptionInterval.deleteMany({
      where: {
        scheduleExceptionId: {
          in: scheduleExceptionIds,
        },
      },
    });
  }

  await prisma.barbershopScheduleException.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.workingHours.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.service.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.employeeInvitation.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.employee.deleteMany({
    where: {
      barbershopId: {
        in: barbershopIds,
      },
    },
  });

  await prisma.barbershop.deleteMany({
    where: {
      id: {
        in: barbershopIds,
      },
    },
  });

  const userIds = employees.map((employee) => employee.userId);

  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}

async function cleanupUsersByClerkIds(clerkUserIds: string[]) {
  if (clerkUserIds.length === 0) {
    return;
  }

  await prisma.user.deleteMany({
    where: {
      clerkUserId: {
        in: clerkUserIds,
      },
    },
  });
}

export async function cleanupPublicBookingE2eFixture(key: string) {
  const ids = buildFixtureIds(key);

  const barbershops = await prisma.barbershop.findMany({
    where: {
      publicSlug: {
        in: [ids.slug, ids.foreignSlug],
      },
    },
    select: {
      id: true,
    },
  });

  await cleanupBarbershopsByIds(barbershops.map((shop) => shop.id));
  await cleanupUsersByClerkIds([
    ids.ownerClerkUserId,
    `${ids.ownerClerkUserId}_foreign`,
    ids.barberClerkUserId,
    ids.foreignBarberClerkUserId,
  ]);
}

export async function cleanupAllPublicBookingE2eFixtures() {
  const barbershops = await prisma.barbershop.findMany({
    where: {
      publicSlug: {
        startsWith: E2E_SLUG_PREFIX,
      },
    },
    select: {
      id: true,
    },
  });

  await cleanupBarbershopsByIds(barbershops.map((shop) => shop.id));

  await prisma.user.deleteMany({
    where: {
      clerkUserId: {
        startsWith: 'e2e_',
      },
    },
  });
}

export async function provisionPublicBookingE2eFixture(
  key: string
): Promise<PublicBookingE2eFixture> {
  const ids = buildFixtureIds(key);
  const futureLocalDate = deriveFutureFixtureLocalDate();

  await cleanupPublicBookingE2eFixture(key);

  const owner = await prisma.user.create({
    data: {
      clerkUserId: ids.ownerClerkUserId,
      email: `${ids.ownerClerkUserId}@example.com`,
      name: ids.ownerName,
      role: 'OWNER',
    },
  });

  const foreignOwner = await prisma.user.create({
    data: {
      clerkUserId: `${ids.ownerClerkUserId}_foreign`,
      email: `${ids.ownerClerkUserId}_foreign@example.com`,
      name: `Foreign ${ids.ownerName}`,
      role: 'OWNER',
    },
  });

  const barberUser = await prisma.user.create({
    data: {
      clerkUserId: ids.barberClerkUserId,
      email: `${ids.barberClerkUserId}@example.com`,
      name: ids.barberDisplayName,
      role: 'BARBER',
    },
  });

  const foreignBarberUser = await prisma.user.create({
    data: {
      clerkUserId: ids.foreignBarberClerkUserId,
      email: `${ids.foreignBarberClerkUserId}@example.com`,
      name: `Barbero externo ${ids.suffix.toUpperCase()}`,
      role: 'BARBER',
    },
  });

  const shop = await prisma.barbershop.create({
    data: {
      ownerId: owner.id,
      name: ids.shopName,
      address: 'Calle E2E 123',
      phone: '+543811110000',
      timezone: E2E_TIMEZONE,
      publicSlug: ids.slug,
      isActive: true,
    },
  });

  const foreignShop = await prisma.barbershop.create({
    data: {
      ownerId: foreignOwner.id,
      name: ids.foreignShopName,
      address: 'Calle Externa 456',
      phone: '+543811110001',
      timezone: E2E_TIMEZONE,
      publicSlug: ids.foreignSlug,
      isActive: true,
    },
  });

  await setupDefaultWorkingHoursForFixture(shop.id);
  await setupDefaultWorkingHoursForFixture(foreignShop.id);

  const service = await prisma.service.create({
    data: {
      barbershopId: shop.id,
      name: ids.serviceName,
      description: 'Servicio de prueba E2E',
      durationMinutes: 30,
      priceCents: 3200,
      currency: 'ARS',
      isActive: true,
    },
  });

  const foreignService = await prisma.service.create({
    data: {
      barbershopId: foreignShop.id,
      name: ids.foreignServiceName,
      description: 'Servicio externo para aislamiento de tenant',
      durationMinutes: 30,
      priceCents: 3600,
      currency: 'ARS',
      isActive: true,
    },
  });

  const barber = await prisma.employee.create({
    data: {
      barbershopId: shop.id,
      userId: barberUser.id,
      isActive: true,
    },
  });

  const foreignBarber = await prisma.employee.create({
    data: {
      barbershopId: foreignShop.id,
      userId: foreignBarberUser.id,
      isActive: true,
    },
  });

  await prisma.employeeService.createMany({
    data: [
      {
        employeeId: barber.id,
        serviceId: service.id,
      },
      {
        employeeId: foreignBarber.id,
        serviceId: foreignService.id,
      },
    ],
  });

  await setScheduleExceptionIntervals({
    barbershopId: shop.id,
    localDate: futureLocalDate,
    intervals: [
      { openTime: '10:00', closeTime: '12:00' },
      { openTime: '15:00', closeTime: '17:00' },
    ],
  });

  await setScheduleExceptionIntervals({
    barbershopId: foreignShop.id,
    localDate: futureLocalDate,
    intervals: [
      { openTime: '11:00', closeTime: '13:00' },
      { openTime: '16:00', closeTime: '18:00' },
    ],
  });

  return {
    slug: ids.slug,
    shopName: ids.shopName,
    serviceId: service.id,
    barberId: barber.id,
    foreignServiceId: foreignService.id,
    foreignBarberId: foreignBarber.id,
    futureLocalDate,
    expectedServiceName: ids.serviceName,
    expectedBarberName: ids.barberDisplayName,
    ownerClerkUserId: ids.ownerClerkUserId,
  };
}
