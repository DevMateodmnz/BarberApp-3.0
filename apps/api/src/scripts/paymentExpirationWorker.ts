import { releaseExpiredPaymentHolds } from '../services/payments/bookingPaymentService.js';

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
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

async function runBatch() {
  const result = await releaseExpiredPaymentHolds();
  console.info('[payments][expire-holds]', result);
}

async function main() {
  if (hasFlag('--once')) {
    await runBatch();
    return;
  }

  const pollIntervalMs = readPositiveIntegerEnv('PAYMENT_EXPIRE_HOLDS_POLL_INTERVAL_MS', 30_000);
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
  console.error('[payments][expire-holds][fatal]', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exitCode = 1;
});
