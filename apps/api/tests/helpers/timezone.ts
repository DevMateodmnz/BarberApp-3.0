import { getLocalDateStringInTimeZone, getUtcRangeForLocalDate } from '../../src/lib/dateUtils.js';

export const TEST_BARBERSHOP_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const FIXED_TEST_NOW = new Date('2026-06-23T00:32:00.000Z');

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return `${String(next.getUTCFullYear()).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function getDayOfWeekForDateString(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function localDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone = TEST_BARBERSHOP_TIMEZONE,
): Date {
  const [hours, minutes] = timeStr.split(':').map(Number) as [number, number];
  const { startUtc } = getUtcRangeForLocalDate(dateStr, timezone);

  return new Date(startUtc.getTime() + ((hours * 60) + minutes) * 60_000);
}

export function getNextLocalWeekdayDate(
  targetDayOfWeek: number,
  reference: Date = FIXED_TEST_NOW,
  timezone = TEST_BARBERSHOP_TIMEZONE,
): string {
  const localToday = getLocalDateStringInTimeZone(timezone, reference);
  const localTodayDayOfWeek = getDayOfWeekForDateString(localToday);
  let daysAhead = (targetDayOfWeek - localTodayDayOfWeek + 7) % 7;

  if (daysAhead === 0) {
    daysAhead = 7;
  }

  return addDaysToDateString(localToday, daysAhead);
}

export function getNextLocalWeekdayTime(
  targetDayOfWeek: number,
  timeStr: string,
  reference: Date = FIXED_TEST_NOW,
  timezone = TEST_BARBERSHOP_TIMEZONE,
): Date {
  return localDateTimeToUtc(
    getNextLocalWeekdayDate(targetDayOfWeek, reference, timezone),
    timeStr,
    timezone,
  );
}

export function getFutureOpenBusinessTime(
  daysFromLocalToday = 1,
  timeStr = '10:00',
  reference: Date = FIXED_TEST_NOW,
  timezone = TEST_BARBERSHOP_TIMEZONE,
): Date {
  let localDate = addDaysToDateString(
    getLocalDateStringInTimeZone(timezone, reference),
    daysFromLocalToday,
  );

  while (getDayOfWeekForDateString(localDate) === 0) {
    localDate = addDaysToDateString(localDate, 1);
  }

  return localDateTimeToUtc(localDate, timeStr, timezone);
}
