import { ValidationError } from './errors.js';

export interface ScheduleIntervalInput {
  openTime: string;
  closeTime: string;
  position?: number;
}

export interface NormalizedScheduleInterval {
  openTime: string;
  closeTime: string;
  position: number;
}

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidLocalTimeString(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(value);
}

export function parseLocalTimeToMinutes(value: string): number {
  if (!isValidLocalTimeString(value)) {
    throw new ValidationError('Time values must use valid HH:mm format');
  }

  const [hours, minutes] = value.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

function normalizeRawInterval(
  raw: string | ScheduleIntervalInput
): ScheduleIntervalInput {
  if (typeof raw !== 'string') {
    return {
      openTime: raw.openTime,
      closeTime: raw.closeTime,
      position: raw.position,
    };
  }

  const parts = raw.split('-');
  if (parts.length !== 2) {
    throw new ValidationError(
      'Interval values must use HH:mm-HH:mm format'
    );
  }

  return {
    openTime: parts[0]!.trim(),
    closeTime: parts[1]!.trim(),
  };
}

export function normalizeScheduleExceptionIntervals(
  rawIntervals: Array<string | ScheduleIntervalInput>
): NormalizedScheduleInterval[] {
  if (rawIntervals.length === 0) {
    throw new ValidationError(
      'At least one custom interval is required when using --interval'
    );
  }

  const normalized = rawIntervals.map(normalizeRawInterval).map((interval) => {
    const openMinutes = parseLocalTimeToMinutes(interval.openTime);
    const closeMinutes = parseLocalTimeToMinutes(interval.closeTime);

    if (openMinutes >= closeMinutes) {
      throw new ValidationError(
        'Each interval start must be strictly before its end'
      );
    }

    return {
      openTime: interval.openTime,
      closeTime: interval.closeTime,
      openMinutes,
      closeMinutes,
    };
  });

  normalized.sort((left, right) => {
    if (left.openMinutes !== right.openMinutes) {
      return left.openMinutes - right.openMinutes;
    }

    return left.closeMinutes - right.closeMinutes;
  });

  const ordered: NormalizedScheduleInterval[] = [];
  let previous: (typeof normalized)[number] | null = null;

  for (const current of normalized) {
    if (
      previous &&
      previous.openMinutes === current.openMinutes &&
      previous.closeMinutes === current.closeMinutes
    ) {
      throw new ValidationError('Custom intervals must not duplicate one another');
    }

    if (previous && current.openMinutes < previous.closeMinutes) {
      throw new ValidationError('Custom intervals must not overlap');
    }

    ordered.push({
      openTime: current.openTime,
      closeTime: current.closeTime,
      position: ordered.length,
    });
    previous = current;
  }

  return ordered;
}

export function stripIntervalPositions(
  intervals: NormalizedScheduleInterval[]
): Array<{ openTime: string; closeTime: string }> {
  return intervals.map(({ openTime, closeTime }) => ({ openTime, closeTime }));
}
