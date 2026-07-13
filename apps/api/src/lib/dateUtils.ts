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
  const startUtc = localDateTimeToUtc(dateStr, '00:00', timezone);
  const endUtc = localDateTimeToUtc(
    addDaysToDateString(dateStr, 1),
    '00:00',
    timezone
  );

  return { startUtc, endUtc };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
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

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getLocalDateTimeParts(
  timezone: string,
  date: Date,
): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  return {
    year: parseInt(parts.find((part) => part.type === 'year')?.value ?? '0', 10),
    month: parseInt(parts.find((part) => part.type === 'month')?.value ?? '0', 10),
    day: parseInt(parts.find((part) => part.type === 'day')?.value ?? '0', 10),
    hour: parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10),
    minute: parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10),
  };
}

function parseTimeZoneOffsetMinutes(
  timezone: string,
  date: Date,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const offsetValue = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (offsetValue === 'GMT') {
    return 0;
  }
  const match = offsetValue?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    throw new Error(`Unable to resolve timezone offset for ${timezone}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2] ?? '0', 10);
  const minutes = parseInt(match[3] ?? '0', 10);

  return sign * ((hours * 60) + minutes);
}

function matchesLocalDateTime(
  timezone: string,
  date: Date,
  targetDate: string,
  targetTime: string,
): boolean {
  const parts = getLocalDateTimeParts(timezone, date);
  return (
    formatDateParts(parts.year, parts.month, parts.day) === targetDate &&
    `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` ===
      targetTime
  );
}

export function tryLocalDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date | null {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = timeStr.split(':').map(Number) as [number, number];
  const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes);

  let guessMs = naiveUtcMs;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offsetMinutes = parseTimeZoneOffsetMinutes(
      timezone,
      new Date(guessMs)
    );
    const nextGuessMs = naiveUtcMs - (offsetMinutes * 60_000);

    if (nextGuessMs === guessMs) {
      break;
    }

    guessMs = nextGuessMs;
  }

  const directCandidate = new Date(guessMs);
  if (matchesLocalDateTime(timezone, directCandidate, dateStr, timeStr)) {
    return directCandidate;
  }

  for (let deltaMinutes = -180; deltaMinutes <= 180; deltaMinutes += 1) {
    const candidate = new Date(guessMs + (deltaMinutes * 60_000));
    if (matchesLocalDateTime(timezone, candidate, dateStr, timeStr)) {
      return candidate;
    }
  }

  return null;
}

export function localDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const resolved = tryLocalDateTimeToUtc(dateStr, timeStr, timezone);

  if (!resolved) {
    throw new Error(
      `Local time ${dateStr} ${timeStr} does not exist in timezone ${timezone}`
    );
  }

  return resolved;
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
