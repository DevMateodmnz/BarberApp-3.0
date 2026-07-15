import { parseLocalTimeToMinutes, type ScheduleIntervalInput } from './scheduleIntervals.js';

export interface TimeInterval {
  openTime: string;
  closeTime: string;
}

interface MinuteInterval extends TimeInterval {
  openMinutes: number;
  closeMinutes: number;
}

function toMinuteInterval(interval: TimeInterval): MinuteInterval {
  return {
    ...interval,
    openMinutes: parseLocalTimeToMinutes(interval.openTime),
    closeMinutes: parseLocalTimeToMinutes(interval.closeTime),
  };
}

export function normalizeTimeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  return [...intervals]
    .map((interval) => toMinuteInterval(interval))
    .sort((left, right) => {
      if (left.openMinutes !== right.openMinutes) {
        return left.openMinutes - right.openMinutes;
      }

      return left.closeMinutes - right.closeMinutes;
    })
    .reduce<MinuteInterval[]>((acc, current) => {
      const previous = acc.at(-1);
      if (!previous) {
        acc.push(current);
        return acc;
      }

      if (current.openMinutes === previous.openMinutes && current.closeMinutes === previous.closeMinutes) {
        return acc;
      }

      if (current.openMinutes <= previous.closeMinutes) {
        acc[acc.length - 1] = {
          ...previous,
          closeTime:
            current.closeMinutes > previous.closeMinutes
              ? current.closeTime
              : previous.closeTime,
          closeMinutes: Math.max(previous.closeMinutes, current.closeMinutes),
        };
        return acc;
      }

      acc.push(current);
      return acc;
    }, [])
    .map(({ openTime, closeTime }) => ({ openTime, closeTime }));
}

export function intersectTimeIntervals(
  left: readonly TimeInterval[],
  right: readonly TimeInterval[]
): TimeInterval[] {
  const normalizedLeft = normalizeTimeIntervals(left).map(toMinuteInterval);
  const normalizedRight = normalizeTimeIntervals(right).map(toMinuteInterval);
  const result: TimeInterval[] = [];

  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < normalizedLeft.length && rightIndex < normalizedRight.length) {
    const currentLeft = normalizedLeft[leftIndex]!;
    const currentRight = normalizedRight[rightIndex]!;

    const openMinutes = Math.max(currentLeft.openMinutes, currentRight.openMinutes);
    const closeMinutes = Math.min(currentLeft.closeMinutes, currentRight.closeMinutes);

    if (openMinutes < closeMinutes) {
      result.push({
        openTime: `${String(Math.floor(openMinutes / 60)).padStart(2, '0')}:${String(openMinutes % 60).padStart(2, '0')}`,
        closeTime: `${String(Math.floor(closeMinutes / 60)).padStart(2, '0')}:${String(closeMinutes % 60).padStart(2, '0')}`,
      });
    }

    if (currentLeft.closeMinutes <= currentRight.closeMinutes) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return normalizeTimeIntervals(result);
}

export function intervalContainsRange(
  intervals: readonly TimeInterval[],
  startTime: string,
  endTime: string
): boolean {
  const startMinutes = parseLocalTimeToMinutes(startTime);
  const endMinutes = parseLocalTimeToMinutes(endTime);

  return normalizeTimeIntervals(intervals)
    .map(toMinuteInterval)
    .some((interval) => startMinutes >= interval.openMinutes && endMinutes <= interval.closeMinutes);
}

export function stripIntervalInputPositions(
  intervals: readonly ScheduleIntervalInput[]
): TimeInterval[] {
  return intervals.map(({ openTime, closeTime }) => ({ openTime, closeTime }));
}
