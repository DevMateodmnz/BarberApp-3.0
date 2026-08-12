import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma, cleanupTestData, createTestBarbershop, createTestEmployee } from './helpers.js';
import { resolveEmployeeEffectiveScheduleForDate } from '../../src/lib/employeeEffectiveSchedule.js';
import { provisionBarbershopScheduleException } from '../../src/services/scheduleExceptionProvisioningService.js';

describe('employee effective schedule', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('defaults new employees to inherited barbershop schedules', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Inherited Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });

    const persisted = await prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
      select: { scheduleMode: true },
    });

    expect(persisted.scheduleMode).toBe('INHERIT_BARBERSHOP');

    const effective = await resolveEmployeeEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      localDate: '2026-12-21',
    });

    expect(effective.source).toBe('weekly');
    expect(effective.intervals).toEqual([{ openTime: '09:00', closeTime: '19:00' }]);
  });

  it('clips a custom weekly employee interval to the barbershop date exception boundary', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Clip Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });

    await prisma.employee.update({
      where: { id: employee.id },
      data: { scheduleMode: 'CUSTOM' },
    });
    await prisma.employeeWorkingInterval.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        dayOfWeek: 1,
        openTime: '08:00',
        closeTime: '13:00',
      },
    });

    await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      localDate: '2026-12-21',
      mode: 'set_intervals',
      dryRun: false,
      intervals: [{ openTime: '10:00', closeTime: '12:00', position: 0 }],
    });

    const effective = await resolveEmployeeEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      localDate: '2026-12-21',
    });

    expect(effective.source).toBe('CUSTOM_WEEKLY');
    expect(effective.intervals).toEqual([{ openTime: '10:00', closeTime: '12:00' }]);
  });

  it('lets employee custom-hours exceptions override the weekly employee interval inside shop hours', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Special Hours Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });

    await prisma.employee.update({
      where: { id: employee.id },
      data: { scheduleMode: 'CUSTOM' },
    });
    await prisma.employeeWorkingInterval.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        dayOfWeek: 1,
        openTime: '09:00',
        closeTime: '13:00',
      },
    });

    const exception = await prisma.employeeScheduleException.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        localDate: '2026-12-21',
        type: 'CUSTOM_HOURS',
      },
    });

    await prisma.employeeScheduleExceptionInterval.createMany({
      data: [
        {
          scheduleExceptionId: exception.id,
          openTime: '15:00',
          closeTime: '18:00',
          position: 0,
        },
      ],
    });

    const effective = await resolveEmployeeEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      localDate: '2026-12-21',
    });

    expect(effective.source).toBe('EMPLOYEE_CUSTOM_HOURS');
    expect(effective.intervals).toEqual([{ openTime: '15:00', closeTime: '18:00' }]);
  });

  it('marks full-day employee time off as unavailable', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Time Off Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });

    await prisma.employeeScheduleException.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        localDate: '2026-12-21',
        type: 'FULL_DAY_OFF',
        reason: 'Vacaciones',
      },
    });

    const effective = await resolveEmployeeEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      employeeId: employee.id,
      localDate: '2026-12-21',
    });

    expect(effective.source).toBe('EMPLOYEE_FULL_DAY_OFF');
    expect(effective.intervals).toEqual([]);
    expect(effective.availabilityViolationCode).toBe('EMPLOYEE_TIME_OFF');
  });

  it('rejects invalid schedule rows and cross-tenant links at the database level', async () => {
    const { barbershop: shopA } = await createTestBarbershop({ name: 'Tenant A' });
    const { barbershop: shopB } = await createTestBarbershop({ name: 'Tenant B' });
    const { employee } = await createTestEmployee({ barbershopId: shopA.id });

    await expect(
      prisma.employeeWorkingInterval.create({
        data: {
          barbershopId: shopA.id,
          employeeId: employee.id,
          dayOfWeek: 7,
          openTime: '09:00',
          closeTime: '13:00',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.employeeWorkingInterval.create({
        data: {
          barbershopId: shopA.id,
          employeeId: employee.id,
          dayOfWeek: 1,
          openTime: '13:00',
          closeTime: '09:00',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.employeeWorkingInterval.create({
        data: {
          barbershopId: shopB.id,
          employeeId: employee.id,
          dayOfWeek: 1,
          openTime: '09:00',
          closeTime: '13:00',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces one logical employee exception per local date', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Unique Exception Shop' });
    const { employee } = await createTestEmployee({ barbershopId: barbershop.id });

    await prisma.employeeScheduleException.create({
      data: {
        barbershopId: barbershop.id,
        employeeId: employee.id,
        localDate: '2026-12-21',
        type: 'FULL_DAY_OFF',
      },
    });

    await expect(
      prisma.employeeScheduleException.create({
        data: {
          barbershopId: barbershop.id,
          employeeId: employee.id,
          localDate: '2026-12-21',
          type: 'CUSTOM_HOURS',
        },
      }),
    ).rejects.toThrow();
  });
});
