import { describe, expect, it } from 'vitest';
import {
  formatScheduleExceptionProvisioningDatabaseTarget,
  normalizeScheduleExceptionIntervals,
  parseScheduleExceptionProvisioningArgs,
} from '../../src/lib/scheduleExceptionProvisioning.js';

describe('parseScheduleExceptionProvisioningArgs', () => {
  it('parses closed-date arguments', () => {
    expect(
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-12-25',
        '--closed',
        '--dry-run',
      ])
    ).toEqual({
      barbershopId: 'shop_123',
      dryRun: true,
      localDate: '2026-12-25',
      mode: 'closed',
    });
  });

  it('parses custom intervals and normalizes order', () => {
    expect(
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-12-24',
        '--interval',
        '16:00-19:00',
        '--interval',
        '09:00-13:00',
      ])
    ).toEqual({
      barbershopId: 'shop_123',
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'set_intervals',
      intervals: [
        { openTime: '09:00', closeTime: '13:00', position: 0 },
        { openTime: '16:00', closeTime: '19:00', position: 1 },
      ],
    });
  });

  it('parses clear arguments', () => {
    expect(
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-12-24',
        '--clear',
      ])
    ).toEqual({
      barbershopId: 'shop_123',
      dryRun: false,
      localDate: '2026-12-24',
      mode: 'clear',
    });
  });

  it('rejects missing required values and mixed operation modes', () => {
    expect(() =>
      parseScheduleExceptionProvisioningArgs(['--date', '2026-12-24', '--closed'])
    ).toThrow(/barbershop-id/i);

    expect(() =>
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--closed',
      ])
    ).toThrow(/date/i);

    expect(() =>
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-12-24',
        '--closed',
        '--clear',
      ])
    ).toThrow(/exactly one/i);
  });

  it('rejects unknown flags and malformed dates', () => {
    expect(() =>
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-12-24',
        '--wat',
      ])
    ).toThrow(/unknown argument/i);

    expect(() =>
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-02-30',
        '--closed',
      ])
    ).toThrow(/valid calendar date/i);

    expect(() =>
      parseScheduleExceptionProvisioningArgs([
        '--barbershop-id',
        'shop_123',
        '--date',
        '2026-2-3',
        '--closed',
      ])
    ).toThrow(/yyyy-mm-dd/i);
  });
});

describe('normalizeScheduleExceptionIntervals', () => {
  it('sorts intervals, assigns positions, and rejects overlap-like invalid inputs', () => {
    expect(
      normalizeScheduleExceptionIntervals([
        '16:00-19:00',
        '09:00-13:00',
      ])
    ).toEqual([
      { openTime: '09:00', closeTime: '13:00', position: 0 },
      { openTime: '16:00', closeTime: '19:00', position: 1 },
    ]);

    expect(() =>
      normalizeScheduleExceptionIntervals(['09:00-13:00', '12:30-18:00'])
    ).toThrow(/overlap/i);

    expect(() =>
      normalizeScheduleExceptionIntervals(['09:00-13:00', '09:00-13:00'])
    ).toThrow(/duplicate/i);

    expect(() => normalizeScheduleExceptionIntervals(['13:00-09:00'])).toThrow(
      /strictly before/i
    );

    expect(() => normalizeScheduleExceptionIntervals(['09:00-09:00'])).toThrow(
      /strictly before/i
    );

    expect(() => normalizeScheduleExceptionIntervals(['24:00-25:00'])).toThrow(
      /hh:mm/i
    );
  });
});

describe('formatScheduleExceptionProvisioningDatabaseTarget', () => {
  it('masks credentials while preserving host, port, and database name', () => {
    expect(
      formatScheduleExceptionProvisioningDatabaseTarget(
        'postgresql://postgres:postgres@localhost:5433/barberapp_test'
      )
    ).toBe('postgresql://localhost:5433/barberapp_test');
  });
});
