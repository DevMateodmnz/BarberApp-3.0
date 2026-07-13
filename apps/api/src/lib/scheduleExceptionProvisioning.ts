import { ServiceRecordDateSchema } from '../schemas/serviceRecord.js';
import {
  normalizeScheduleExceptionIntervals,
  type NormalizedScheduleInterval,
} from './scheduleIntervals.js';

export type ScheduleExceptionProvisioningArgs =
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'closed';
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'clear';
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      localDate: string;
      mode: 'set_intervals';
      intervals: NormalizedScheduleInterval[];
    };

function readRequiredValue(
  argv: string[],
  index: number,
  flag: string
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function parseLocalDate(dateInput: string): string {
  return ServiceRecordDateSchema.parse(dateInput.trim());
}

export function parseScheduleExceptionProvisioningArgs(
  argv: string[]
): ScheduleExceptionProvisioningArgs {
  let barbershopId: string | undefined;
  let localDate: string | undefined;
  let closed = false;
  let clear = false;
  let dryRun = false;
  const intervalValues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--barbershop-id':
        barbershopId = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--date':
        localDate = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--interval':
        intervalValues.push(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case '--closed':
        closed = true;
        break;
      case '--clear':
        clear = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!barbershopId?.trim()) {
    throw new Error('--barbershop-id is required');
  }

  if (!localDate?.trim()) {
    throw new Error('--date is required');
  }

  const operationCount =
    Number(closed) + Number(clear) + Number(intervalValues.length > 0);

  if (operationCount !== 1) {
    throw new Error(
      'Provide exactly one operation: --closed, one or more --interval values, or --clear'
    );
  }

  const normalizedDate = parseLocalDate(localDate);
  const normalizedBarbershopId = barbershopId.trim();

  if (closed) {
    return {
      barbershopId: normalizedBarbershopId,
      dryRun,
      localDate: normalizedDate,
      mode: 'closed',
    };
  }

  if (clear) {
    return {
      barbershopId: normalizedBarbershopId,
      dryRun,
      localDate: normalizedDate,
      mode: 'clear',
    };
  }

  return {
    barbershopId: normalizedBarbershopId,
    dryRun,
    localDate: normalizedDate,
    mode: 'set_intervals',
    intervals: normalizeScheduleExceptionIntervals(intervalValues),
  };
}

export function formatScheduleExceptionProvisioningDatabaseTarget(
  databaseUrl: string
): string {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
}

export { normalizeScheduleExceptionIntervals } from './scheduleIntervals.js';
