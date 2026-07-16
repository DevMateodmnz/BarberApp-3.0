import { AppError } from '../lib/errors.js';
import {
  addDaysToDateString,
  getLocalDateStringInTimeZone,
} from '../lib/dateUtils.js';
import { buildAvailabilitySlots } from '../lib/availabilitySlots.js';
import { getPublicBookingPolicy } from '../lib/publicBookingPolicy.js';
import { prisma } from '../lib/prisma.js';
import { resolvePublishedPublicBarbershop } from './publicCatalogService.js';
import { releaseExpiredPaymentHolds } from './payments/bookingPaymentService.js';

export interface PublicAvailabilityDto {
  slug: string;
  serviceId: string;
  barberId: string;
  localDate: string;
  timezone: string;
  slotIntervalMinutes: number;
  serviceDurationMinutes: number;
  slots: Array<{
    startAt: string;
    endAt: string;
  }>;
}

interface GetPublicAvailabilityInput {
  slug: string;
  barberId: string;
  serviceId: string;
  localDate: string;
  now?: Date;
}

function createPublicNotFoundError(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Public resource not found');
}

function validatePublicAvailabilityDate(localDate: string, timezone: string, now: Date) {
  const policy = getPublicBookingPolicy();
  const todayLocalDate = getLocalDateStringInTimeZone(timezone, now);

  if (localDate < todayLocalDate) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_DATE',
      'Availability cannot be requested for a past date'
    );
  }

  const finalAllowedDate = addDaysToDateString(
    todayLocalDate,
    policy.maximumBookingHorizonDays
  );

  if (localDate > finalAllowedDate) {
    throw new AppError(
      400,
      'INVALID_APPOINTMENT_DATE',
      'Availability cannot be requested beyond the public booking horizon'
    );
  }
}

export async function getPublicBarberAvailabilityBySlug(
  input: GetPublicAvailabilityInput
): Promise<PublicAvailabilityDto> {
  const now = input.now ?? new Date();
  const policy = getPublicBookingPolicy();
  const barbershop = await resolvePublishedPublicBarbershop(input.slug);

  validatePublicAvailabilityDate(input.localDate, barbershop.timezone, now);

  const service = await prisma.service.findFirst({
    where: {
      id: input.serviceId,
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      durationMinutes: true,
    },
  });

  if (!service) {
    throw createPublicNotFoundError();
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: input.barberId,
      barbershopId: barbershop.id,
      isActive: true,
      deletedAt: null,
      employeeServices: {
        some: {
          serviceId: service.id,
          service: {
            id: service.id,
            barbershopId: barbershop.id,
            isActive: true,
            deletedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!employee) {
    throw createPublicNotFoundError();
  }

  await releaseExpiredPaymentHolds({
    now,
    employeeId: employee.id,
  });

  const slots = await buildAvailabilitySlots({
    barbershopId: barbershop.id,
    employeeId: employee.id,
    localDate: input.localDate,
    timezone: barbershop.timezone,
    serviceDurationMinutes: service.durationMinutes,
    slotIntervalMinutes: policy.slotIntervalMinutes,
    blockingStatuses: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'],
    now,
    minimumNoticeMinutes: policy.minimumNoticeMinutes,
  });

  return {
    slug: barbershop.slug,
    serviceId: service.id,
    barberId: employee.id,
    localDate: input.localDate,
    timezone: barbershop.timezone,
    slotIntervalMinutes: policy.slotIntervalMinutes,
    serviceDurationMinutes: service.durationMinutes,
    slots: slots.map((slot) => ({
      startAt: slot.startAt,
      endAt: slot.endAt,
    })),
  };
}
