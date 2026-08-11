import { processPendingPaymentWebhookEvents } from '../services/payments/bookingPaymentService.js';
import { readPaymentRuntimeConfig } from '../lib/payments/runtime.js';

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
  const result = await processPendingPaymentWebhookEvents();
  console.info('[payments][webhook-worker]', result);
}

async function main() {
  if (!readPaymentRuntimeConfig(process.env).enabled) {
    // eslint-disable-next-line no-console
    console.info('[payments][webhook-worker] PAYMENTS_ENABLED=false; exiting without processing');
    return;
  }

  if (hasFlag('--once')) {
    await runBatch();
    return;
  }

  const pollIntervalMs = readPositiveIntegerEnv('PAYMENT_WEBHOOK_WORKER_POLL_INTERVAL_MS', 10_000);
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
  console.error('[payments][webhook-worker][fatal]', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exitCode = 1;
});
