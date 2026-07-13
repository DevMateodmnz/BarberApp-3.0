import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/lib/errors.js';
import { resolveEffectiveScheduleForDate } from '../../src/lib/effectiveSchedule.js';
import {
  cleanupTestData,
  createTestBarbershop,
  prisma,
} from './helpers.js';
import { provisionBarbershopScheduleException } from '../../src/services/scheduleExceptionProvisioningService.js';

describe('schedule exception provisioning service', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('creates a closed-date exception for one local date', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Holiday Shop' });
    const result = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-25',
      mode: 'closed',
    });

    expect(result.changed).toBe(true);
    expect(result.nextStatus).toBe('closed');
    expect(result.nextIntervals).toEqual([]);

    const effective = await resolveEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      localDate: '2026-12-25',
    });

    expect(effective.source).toBe('date_exception_closed');
    expect(effective.intervals).toEqual([]);
  });

  it('creates sorted split intervals that replace weekly hours for that date only', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Split Shift Shop' });

    const result = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'set_intervals',
      intervals: [
        { openTime: '16:00', closeTime: '19:00', position: 0 },
        { openTime: '09:00', closeTime: '13:00', position: 1 },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.nextStatus).toBe('custom');
    expect(result.nextIntervals).toEqual([
      { openTime: '09:00', closeTime: '13:00', position: 0 },
      { openTime: '16:00', closeTime: '19:00', position: 1 },
    ]);

    const effective = await resolveEffectiveScheduleForDate({
      barbershopId: barbershop.id,
      localDate: '2026-12-24',
    });

    expect(effective.source).toBe('date_exception_custom');
    expect(effective.intervals).toEqual([
      { openTime: '09:00', closeTime: '13:00' },
      { openTime: '16:00', closeTime: '19:00' },
    ]);
  });

  it('supports dry runs without persisting', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Dry Run Shop' });

    const result = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: true,
      localDate: '2026-12-24',
      mode: 'closed',
    });

    expect(result.changed).toBe(true);
    expect(result.nextStatus).toBe('closed');

    const exceptionRow = await prisma.barbershopScheduleException.findUnique({
      where: {
        barbershopId_localDate: {
          barbershopId: barbershop.id,
          localDate: '2026-12-24',
        },
      },
    });

    expect(exceptionRow).toBeNull();
  });

  it('clears existing exceptions deterministically', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Clear Shop' });

    await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'closed',
    });

    const cleared = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'clear',
    });
    expect(cleared.changed).toBe(true);
    expect(cleared.nextStatus).toBe('none');

    const clearedAgain = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'clear',
    });
    expect(clearedAgain.changed).toBe(false);
    expect(clearedAgain.nextStatus).toBe('none');
  });

  it('keeps repeated identical interval operations deterministic', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Deterministic Shop' });

    await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'set_intervals',
      intervals: [{ openTime: '09:00', closeTime: '13:00', position: 0 }],
    });

    const repeated = await provisionBarbershopScheduleException({
      barbershopId: barbershop.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'set_intervals',
      intervals: [{ openTime: '09:00', closeTime: '13:00', position: 0 }],
    });

    expect(repeated.changed).toBe(false);
    expect(repeated.nextStatus).toBe('custom');
  });

  it('supports the same local date independently across tenants', async () => {
    const { barbershop: shopA } = await createTestBarbershop({ name: 'Tenant A' });
    const { barbershop: shopB } = await createTestBarbershop({ name: 'Tenant B' });

    await provisionBarbershopScheduleException({
      barbershopId: shopA.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'closed',
    });

    await provisionBarbershopScheduleException({
      barbershopId: shopB.id,
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'set_intervals',
      intervals: [{ openTime: '10:00', closeTime: '14:00', position: 0 }],
    });

    const [effectiveA, effectiveB] = await Promise.all([
      resolveEffectiveScheduleForDate({
        barbershopId: shopA.id,
        localDate: '2026-12-24',
      }),
      resolveEffectiveScheduleForDate({
        barbershopId: shopB.id,
        localDate: '2026-12-24',
      }),
    ]);

    expect(effectiveA.source).toBe('date_exception_closed');
    expect(effectiveB.source).toBe('date_exception_custom');
    expect(effectiveB.intervals).toEqual([{ openTime: '10:00', closeTime: '14:00' }]);
  });

  it('rejects overlap-like invalid interval input and missing shops', async () => {
    const { barbershop } = await createTestBarbershop({ name: 'Invalid Interval Shop' });

    await expect(
      provisionBarbershopScheduleException({
        barbershopId: barbershop.id,
        dryRun: false,
        localDate: '2026-12-24',
        mode: 'set_intervals',
        intervals: [
          { openTime: '09:00', closeTime: '13:00', position: 0 },
          { openTime: '12:30', closeTime: '15:00', position: 1 },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      provisionBarbershopScheduleException({
        barbershopId: 'missing-shop-id',
        dryRun: false,
        localDate: '2026-12-24',
        mode: 'closed',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
