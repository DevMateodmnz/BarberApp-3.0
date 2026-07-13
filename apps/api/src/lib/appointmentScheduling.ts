export const APPOINTMENT_SLOT_INTERVAL_MINUTES = 30;

export function isSlotBoundaryMinute(
  minutesSinceMidnight: number,
  slotIntervalMinutes: number = APPOINTMENT_SLOT_INTERVAL_MINUTES
): boolean {
  return minutesSinceMidnight % slotIntervalMinutes === 0;
}

export function roundMinutesUpToSlotBoundary(
  minutesSinceMidnight: number,
  slotIntervalMinutes: number = APPOINTMENT_SLOT_INTERVAL_MINUTES
): number {
  const remainder = minutesSinceMidnight % slotIntervalMinutes;
  return remainder === 0
    ? minutesSinceMidnight
    : minutesSinceMidnight + (slotIntervalMinutes - remainder);
}
