import { createSmtpEmailTransportFromEnv } from '../lib/emailTransport.js';
import {
  APPOINTMENT_NOTIFICATION_DEFAULT_BATCH_SIZE,
  APPOINTMENT_NOTIFICATION_STALE_LOCK_MS,
  processAppointmentNotificationBatch,
} from '../services/appointmentNotificationService.js';

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatch(): Promise<void> {
  const transport = createSmtpEmailTransportFromEnv(process.env);
  const result = await processAppointmentNotificationBatch({
    transport,
    publicWebBaseUrl: process.env.PUBLIC_WEB_BASE_URL?.trim() || undefined,
    batchSize: readPositiveIntegerEnv(
      process.env,
      'NOTIFICATION_WORKER_BATCH_SIZE',
      APPOINTMENT_NOTIFICATION_DEFAULT_BATCH_SIZE
    ),
    staleAfterMs: readPositiveIntegerEnv(
      process.env,
      'NOTIFICATION_STALE_LOCK_MS',
      APPOINTMENT_NOTIFICATION_STALE_LOCK_MS
    ),
  });

  console.info('[notifications][worker]', result);
}

async function main() {
  const once = hasFlag('--once');
  if (once) {
    await runBatch();
    return;
  }

  const pollIntervalMs = readPositiveIntegerEnv(
    process.env,
    'NOTIFICATION_WORKER_POLL_INTERVAL_MS',
    30_000
  );
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    await runBatch();
    if (stopping) {
      break;
    }
    await sleep(pollIntervalMs);
  }
}

main().catch((error) => {
  console.error('[notifications][worker][fatal]', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown worker error',
  });
  process.exitCode = 1;
});
