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
