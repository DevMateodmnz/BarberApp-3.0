import { describe, expect, it } from 'vitest';
import {
  getLocalTimeStringInTimeZone,
  getUtcRangeForLocalDate,
  localDateTimeToUtc,
} from '../../src/lib/dateUtils.js';

describe('dateUtils', () => {
  it('converts Argentina midnights and nearby times to the correct UTC instants', () => {
    expect(
      localDateTimeToUtc('2026-06-06', '00:00', 'America/Argentina/Buenos_Aires').toISOString()
    ).toBe('2026-06-06T03:00:00.000Z');
    expect(
      localDateTimeToUtc('2026-06-06', '00:00', 'America/Argentina/Tucuman').toISOString()
    ).toBe('2026-06-06T03:00:00.000Z');
    expect(
      localDateTimeToUtc('2026-06-05', '23:30', 'America/Argentina/Buenos_Aires').toISOString()
    ).toBe('2026-06-06T02:30:00.000Z');
    expect(
      localDateTimeToUtc('2026-06-06', '00:30', 'America/Argentina/Buenos_Aires').toISOString()
    ).toBe('2026-06-06T03:30:00.000Z');
  });

  it('converts UTC, east-of-UTC, and west-of-UTC midnights correctly', () => {
    expect(localDateTimeToUtc('2026-06-06', '00:00', 'UTC').toISOString()).toBe(
      '2026-06-06T00:00:00.000Z'
    );
    expect(
      localDateTimeToUtc('2026-06-06', '00:00', 'Europe/Berlin').toISOString()
    ).toBe('2026-06-05T22:00:00.000Z');
    expect(
      localDateTimeToUtc('2026-06-06', '00:00', 'America/Los_Angeles').toISOString()
    ).toBe('2026-06-06T07:00:00.000Z');
  });

  it('normalizes formatted midnight back to 00:00 instead of 24:00', () => {
    expect(
      getLocalTimeStringInTimeZone(
        'America/Argentina/Buenos_Aires',
        new Date('2026-06-06T03:00:00.000Z')
      )
    ).toBe('00:00');
    expect(
      getLocalTimeStringInTimeZone('UTC', new Date('2026-06-06T00:00:00.000Z'))
    ).toBe('00:00');
  });

  it('returns the correct UTC date range for a normal Argentina day', () => {
    const { startUtc, endUtc } = getUtcRangeForLocalDate(
      '2026-06-06',
      'America/Argentina/Buenos_Aires'
    );

    expect(startUtc.toISOString()).toBe('2026-06-06T03:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-07T03:00:00.000Z');
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('returns a 23-hour range across DST spring-forward and rejects nonexistent times', () => {
    const { startUtc, endUtc } = getUtcRangeForLocalDate(
      '2026-03-08',
      'America/New_York'
    );

    expect(startUtc.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(endUtc.getTime() - startUtc.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(() =>
      localDateTimeToUtc('2026-03-08', '02:30', 'America/New_York')
    ).toThrow(/does not exist/i);
  });

  it('returns a 25-hour range across DST fall-back and resolves ambiguous times deterministically', () => {
    const { startUtc, endUtc } = getUtcRangeForLocalDate(
      '2026-11-01',
      'America/New_York'
    );

    expect(startUtc.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(endUtc.getTime() - startUtc.getTime()).toBe(25 * 60 * 60 * 1000);
    expect(
      localDateTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()
    ).toBe('2026-11-01T05:30:00.000Z');
  });
});
