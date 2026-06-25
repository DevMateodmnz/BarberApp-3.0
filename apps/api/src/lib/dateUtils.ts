/**
 * Date utility helpers
 *
 * Provides timezone-aware date range calculations using only
 * Node.js Intl.DateTimeFormat (no external tz library needed).
 *
 * MVP note: Barbershop.timezone is used for local-day filtering.
 * Argentina currently does not observe DST, so fixed-offset zones
 * like America/Argentina/Buenos_Aires are safe for MVP.
 */

/**
 * Calculates the UTC range that covers a full local calendar day
 * in the given IANA timezone.
 *
 * @param dateStr  "YYYY-MM-DD" in the target local timezone
 * @param timezone IANA timezone string (e.g. "America/Argentina/Buenos_Aires")
 * @returns        { startUtc, endUtc } where startUtc is inclusive and endUtc is exclusive
 *
 * Strategy: use UTC noon as a reference point (safe from DST edge cases),
 * then compute the local time-of-day at that moment to derive the offset.
 * Start-of-day in UTC = noonUtc - localMinutesSinceMidnight.
 */
export function getUtcRangeForLocalDate(
  dateStr: string,
  timezone: string
): { startUtc: Date; endUtc: Date } {
  // UTC noon on the target date — safe reference point
  const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);

  // Get local time-of-day at that UTC moment
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(noonUtc);

  const hour = parseInt(
    parts.find((p) => p.type === 'hour')!.value,
    10
  );
  const minute = parseInt(
    parts.find((p) => p.type === 'minute')!.value,
    10
  );
  const localMinutesSinceMidnight = hour * 60 + minute;

  // Start of local day in UTC = noonUtc minus the local time elapsed
  const startUtc = new Date(
    noonUtc.getTime() - localMinutesSinceMidnight * 60_000
  );

  // End of local day (exclusive) = startUtc + 24h
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60_000);

  return { startUtc, endUtc };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

function startOfWeekMonday(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDaysToDateString(dateStr, -daysSinceMonday);
}

function startOfNextMonth(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month, 1));
  return formatDateParts(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

function startOfNextYear(dateStr: string): string {
  const [year] = dateStr.split('-').map(Number) as [number, number, number];
  return formatDateParts(year + 1, 1, 1);
}

export function getLocalDateStringInTimeZone(
  timezone: string,
  date: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return formatDateParts(
    parseInt(parts.find((p) => p.type === 'year')!.value, 10),
    parseInt(parts.find((p) => p.type === 'month')!.value, 10),
    parseInt(parts.find((p) => p.type === 'day')!.value, 10),
  );
}

export function localDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [hours, minutes] = timeStr.split(':').map(Number) as [number, number];
  const { startUtc } = getUtcRangeForLocalDate(dateStr, timezone);

  return new Date(startUtc.getTime() + ((hours * 60) + minutes) * 60_000);
}

export function getLocalTimeStringInTimeZone(
  timezone: string,
  date: Date,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

  return `${hour}:${minute}`;
}

export type SummaryPeriod = 'today' | 'week' | 'month' | 'year';

export function getUtcRangeForLocalPeriod(
  period: SummaryPeriod,
  timezone: string,
  now: Date = new Date(),
): { startUtc: Date; endUtc: Date; rangeStart: string; rangeEnd: string } {
  const localToday = getLocalDateStringInTimeZone(timezone, now);

  let rangeStart = localToday;
  let exclusiveRangeEnd = addDaysToDateString(localToday, 1);

  if (period === 'week') {
    rangeStart = startOfWeekMonday(localToday);
    exclusiveRangeEnd = addDaysToDateString(rangeStart, 7);
  } else if (period === 'month') {
    const [year, month] = localToday.split('-').map(Number) as [number, number, number];
    rangeStart = formatDateParts(year, month, 1);
    exclusiveRangeEnd = startOfNextMonth(rangeStart);
  } else if (period === 'year') {
    const [year] = localToday.split('-').map(Number) as [number, number, number];
    rangeStart = formatDateParts(year, 1, 1);
    exclusiveRangeEnd = startOfNextYear(rangeStart);
  }

  const { startUtc } = getUtcRangeForLocalDate(rangeStart, timezone);
  const { startUtc: endUtc } = getUtcRangeForLocalDate(exclusiveRangeEnd, timezone);

  return {
    startUtc,
    endUtc,
    rangeStart,
    rangeEnd: addDaysToDateString(exclusiveRangeEnd, -1),
  };
}
